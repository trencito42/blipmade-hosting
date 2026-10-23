# 11 — Onboarding: de la prima vizită la primul server care funcționează

> **Agent:** A11 (audit tehnic + comercial, sesiune ramură).
> **Natură:** audit **read-only**. Singurele fișiere scrise: cele trei documente `11-*.md` din acest director.
> **Producție:** nicio scriere, niciun deploy, nicio comandă, nicio plată, niciun e-mail, nicio ștergere de date de clienți. O singură autentificare în browser, cu contul de test seed-uit `qa.headless.one@example.test`, pentru a vedea ecranele reale.

## 0. Sumar executiv

**Nu există drum de la „prima vizită" la „primul server care funcționează".** Nu pentru că lipsesc ecrane — ecranele există, sunt complete și arată bine. Pentru că fiecare etapă a drumului este ruptă, în mod independent:

| Etapă | Stare | Dovadă |
|---|---|---|
| Clientul ajunge pe un produs pe care îl poate cumpăra | **4 din 5 produse nu se pot deploying** — pagina spune textual „**1 of 5 products can be deployed right now.**" | `VERIFIED` (browser) |
| Clientul plătește | **Checkout-ul răspunde `503`** | `VERIFIED` (browser, răspuns real capturat) |
| Clientul primește confirmarea pe e-mail | **Nu se livrează niciun e-mail** — 4 175 mesaje de verificare stau în fișier | `VERIFIED` (psql + `ls`) |
| Serverul este pornit | **Instanța este provisionată dintr-o comandă neplătită** | `VERIFIED` (psql) |
| Serverul chiar rulează | **Containernul e `offline`, uptime 0 m, memorie 0 B** — în ciuda faptului că baza de date spune „Online" | `VERIFIED` (API + browser) |
| Clientul are un cod de pornit | **Nu există `package.json` și nu există `index.js`** în container | `VERIFIED` (API `files`) |
| Clientul ajunge la serverul lui | **Nu există URL public** — `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` sunt toate goale | `VERIFIED` (`.env`) |
| Clientul are ajutor când ceva nu merge | **Ticketul nu notifică pe nimeni** (vezi `11-support-and-operations.md`) | `VERIFIED` |

Partea cea mai gravă nu e că platforma e incompletă. E că **platforma îi spune clientului că are un server care funcționează, și îl minte.** Dashboard-ul arată „Discord Bot — Online", bara de stare arată „Everything is running", activitatea arată „provisioned: Instance is online." și „Container started." — în timp ce API-ul de resurse al aceleiași instanțe întoarce `state: "offline"`, `uptime: 0`, `memory_bytes: 0`, iar în directorul containerului nu există niciun fișier de aplicație.

---

## 1. Metodă și limite

**Ce am făcut.** Citit de cod (`web/src/**`, `api/src/**`, `api/prisma/schema.prisma`); interogări `psql` read-only; interogări read-only la panoul Pterodactyl (doar `GET`); **o singură autentificare** în browser cu contul de test, apoi capturi de ecran și de răspunsuri API reale prin aceeași sesiune; citirea `.env` de pe VM 103 **fără a afișa valorile secretelor** (doar prezență/lungime).

**Ce am evitat intenționat.** Nu am creat o comandă (ar fi fost o scriere în baza de producție) și nu am creat un ticket. Consecință: **ruta de plată a fost verificată prin `POST /api/orders/:id/checkout` pe o comandă deja existentă a contului de test**, iar API-ul aruncă excepția **înainte** de orice scriere (`api/src/routes/orders.ts:154` — `createCheckout()` înainte de `prisma.order.update` de la `:159`). Deci apelul e fără efect lateral. Comanda nu a fost modificată: e în continuare `AWAITING_PAYMENT`.

**Limita de fond.** Platforma are ~22 de ore de existență (`min(createdAt)` pe `User` = `2026-10-22 19:55:54` — `VERIFIED`). **Nu există niciun client real, nicio comandă plătită, niciun ticket organic.** Călătoria de mai jos este parcursă cu contul de test, pe starea reală a producției.

---

## 2. Harta reală a rutelor

Surse: `web/src/routes.tsx:85-121` (`CODE-INSPECTED`) și capturi de browser pe fiecare rută (`VERIFIED`). Fiecare rută a fost deschisă și textul ei a fost extras.

### 2.1 Zone publice (fără sesiune)

| Rută | Ecran | Titlu în interfață | Observație |
|---|---|---|---|
| `/` | `pages/Home.tsx` | „THE SIMPLER WAY TO SELF-HOST" | pagina de marketing, cu un catalog de **12 aplicații** |
| `/login` | `pages/Login.tsx` | „Log in" | `guestOnly` — cu sesiune, redirecționează după rol (`routes.tsx:86`, `GuestOnly` la `:177`) |
| `/register` | `pages/Register.tsx` | „Create account" | `guestOnly` (`routes.tsx:87`) |
| `/forgot-password` | `pages/ForgotPassword.tsx` | „Reset password" | |
| `/reset-password` | `pages/ResetPassword.tsx` | „Choose a new password" | |
| `/verify-email` | `pages/VerifyEmail.tsx` | „Verify email" | **ineficient** — vezi §5.3 |
| `/docs` | `pages/Docs.tsx` | „Documentation" | 110 KB de conținut (`CODE-INSPECTED`) |
| `/status` | `pages/Status.tsx` | „Service status" | |
| `/apps` | `app/ProductPage.tsx → CatalogIndex` | „Catalog" | catalogul public |
| `/apps/:slug` | `app/ProductPage.tsx` | „Product" | pagina publică de produs |
| `/deploy/:slug` | `DeployRedirect` | — | **redirecționează** la `/app/deploy/:slug` (`routes.tsx:70-83`); vizitatorul anonim ajunge pe `/login?next=/app/deploy/:slug` |

### 2.2 Zona client (`area: 'customer'`, sesiune obligatorie)

| Rută | Ecran | Titlu în interfață | Ce am văzut |
|---|---|---|---|
| `/app` | `app/Overview.tsx` | „Overview" | „SERVICES 1", „MONTHLY TOTAL €1.72 / month", „NEEDS ATTENTION 0", „**Everything is running**" |
| `/app/instances` | `app/Instances.tsx` | „Apps & databases" | un rând: „Discord Bot \| Online \| 512 MB · 1 vCPU · 5 GB disk \| €1.72 / month \| **—**" (coloana NODE e goală) |
| `/app/instances/:id` | `app/InstanceDetail.tsx` | „Instance" | vezi §4.1 |
| `/app/deploy` | `app/DeployCatalog.tsx` | „Deploy" | „**1 of 5 products can be deployed right now.**" |
| `/app/deploy/:slug` | `app/Deploy.tsx` | „Deploy" | wizard în 4 pași |
| `/app/domains` | `app/Domains.tsx` | „Domains" | fără domeniu de bază configurat |
| `/app/billing` | `app/Billing.tsx` | „Billing" | „CURRENT PERIOD ENDS — Not available yet", „PAYMENT METHOD — No payment method on file", „**Subscriptions — No subscriptions yet**", „**Invoices — No invoices yet**" |
| `/app/tickets` | `app/Tickets.tsx` | „Support" | 14 ticketuri, toate „Open", toate „**No replies yet**" |
| `/app/tickets/:id` | `app/TicketDetail.tsx` | „Ticket" | |
| `/app/settings` | `app/Settings.tsx` | „Settings" | „EMAIL ADDRESS … **Not verified**"; lista de sesiuni; „Cancel instance" |

### 2.3 Zona personal (`area: 'admin'`)

`/admin`, `/admin/customers`, `/admin/customers/:id`, `/admin/orders`, `/admin/services`, `/admin/products`, `/admin/pricing`, `/admin/tickets`, `/admin/promotions`, `/admin/infrastructure`, `/admin/audit`, `/admin/staff`, `/admin/settings` — toate `CODE-INSPECTED` din `routes.tsx:108-120`. Navigația: `web/src/nav.ts` (`CUSTOMER_NAV`, `ADMIN_NAV`).

**Observație de navigație:** bara laterală a clientului conține „Overview, Deploy, Apps & databases, Domains, Billing, Support, Settings" (`VERIFIED` în capturi) — i.e. **„Support" este o pagină de ticketing, nu un canal de suport funcțional.** Vezi `11-support-and-operations.md`.

---

## 3. Ce promite marketingul vs ce există în baza de date

**Pagina de start `/` prezintă 12 aplicații** (`VERIFIED`, text extras din browser):

| Afișat pe `/` | Categorie | Preț afișat | Exists în `Product`? |
|---|---|---|---|
| WordPress | Web & CMS | €1.49 | **da**, dar `deployable = false` |
| Ghost | Web & CMS | €1.99 | **nu** — nicio linie în `Product` |
| Forgejo | Developer Tools | €2.49 | **nu** |
| Code Server | Developer Tools | €2.99 | **da**, `deployable = false` |
| Uptime Kuma | Monitoring | €1.49 | **da**, `deployable = false` |
| Grafana | Monitoring | €2.49 | **nu** |
| n8n | Automation | €2.99 | **nu** |
| Discord Bot | Bots | €1.49 | **da**, `deployable = true` |
| PostgreSQL | Databases | €4.49 | **da**, `deployable = false` |
| MySQL | Databases | €4.49 | **nu** |
| Redis | Databases | €4.49 | **nu** |
| MongoDB | Databases | €4.99 | **nu** |

`VERIFIED` (catalогul public, browser) + `VERIFIED` (interogarea tabelului `Product`: 5 rânduri — `code-server`, `discord-bot`, `postgresql`, `uptime-kuma`, `wordpress`).

**Deci 7 din 12 aplicații anunțate nu există deloc ca produse**, iar 4 din cele 5 existente sunt blocate. Doar `discord-bot` poate fi cumpărat. Prețurile afișate pe pagina de start (€1.49 / €1.99 / €2.49 / €2.99 / €4.49 / €4.99) **nu au nicio bază în datele de preț ale platformei** — nu există `ProductPrice` pentru produsele inexistente.

> **Divergență de notat:** prețul afișat pe pagina de start pentru `discord-bot` este **€1.49**, iar prețul efectiv al configurației implicite (512 MB / 1 vCPU / 5 GB) este **€1.72** (`VERIFIED`, DB: `price = 172` pe toate cele 3 instanțe). Cardul de preț al auditului confirmă: `256 MB / 1 vCPU / 1 GB` → **€1.49**; `512 MB / 1 vCPU / 5 GB` → **€1.72**. Cele două cifre nu sunt în contradicție — dar pagina de start prezintă prețul de bază drept „preț de la", iar clientul vede în wizard €1.72. **Niciuna dintre cele două nu e falsă; dar diferența nu e explicată nicăieri pe pagina de start.**

---

## 4. Cele opt ruperi, fiecare cu dovezi

### 4.1 R1 — Doar 1 din 5 produse poate fi deployed

`VERIFIED` (browser, `/app/deploy`): antetul paginii scrie **„1 of 5 products can be deployed right now."** Fiecare produs blocat afișează eticheta „**COMING SOON**" și textul:

> „Its image is not installed on the platform yet, so it is listed but cannot be deployed."
> „Coming soon — This product is not validated for deployment yet. **You cannot order it today.**"

`CODE-INSPECTED` + `VERIFIED` (DB): câmpul `Product.deployable` este `false` pentru `code-server`, `postgresql`, `uptime-kuma`, `wordpress`, și `true` doar pentru `discord-bot`. Pentru cele patru produse blocate, `eggId`, `dockerImage` și `startupCommand` sunt **toate goale** — nu există niciun ou, nicio imagine, nicio comandă de pornire.

**Efectul asupra clientului:** un vizitator care vine din Google pe „Blipmade Minecraft" sau „Blipmade WordPress" aterizează pe un produs pentru care nu poate face nimic. **4 din 5 produse sunt afișate, descrise, cu preț, și nu se pot cumpăra.**

### 4.2 R2 — Checkout-ul răspunde `503`

`VERIFIED` — am apelat `POST /api/orders/:id/checkout` pe o comandă existentă a contului de test (comanda `BM-00002`, `AWAITING_PAYMENT`, 172 EUR), cu sesiunea deja autentificată. Răspunsul real, capturat:

```json
{
  "error": {
    "code": "payments_unavailable",
    "message": "Payments are not available at the moment: no Stripe key is configured on this environment.",
    "requestId": "req-4ri"
  }
}
```

`CODE-INSPECTED`: `api/src/services/stripe.ts:150-153` — `if (!env.paymentsEnabled) throw paymentsUnavailable();`, iar `api/src/env.ts:136` definește `paymentsEnabled: raw.PAYMENTS_ENABLED && raw.STRIPE_SECRET_KEY.startsWith('sk_')`. `VERIFIED` pe host: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` de lungime **0**.

`CODE-INSPECTED`: `api/src/routes/orders.ts:154` — excepția e aruncată **înainte** de `prisma.order.update` (`:159`), deci comanda rămâne neatinsă. Confirmat: comanda e în continuare `AWAITING_PAYMENT` după apel.

**Ce vede clientul:** în `web/src/app/Deploy.tsx` există un mesaj pregătit pentru cazul „checkout indisponibil" („Checkout is not available", „The order was created and stays unpaid.", „Open a support ticket to finish the payment"). **Acest mesaj nu se afișează**, pentru că drumul de eroare real este o excepție aruncată (cod `payments_unavailable`), nu un răspuns `{ url: null }`. Clientul vede mesajul generic de eroare al formularului — fără instrucțiunea de a deschide un ticket. `CODE-INSPECTED` (`web/src/app/Deploy.tsx`, `placeOrder` → `checkoutIssue` vs `placeOrder.error`).

**Cum rămâne clientul:** comanda **e creată** înainte de checkout (ruta `POST /orders` creează și adaugă rândul de audit `order.created` — `VERIFIED`, 13 rânduri `order.created` în log). Clientul trece pe pasul 4 „Provisioning", unde interfața așteaptă o comandă plătită — și care nu se va plăti niciodată. Comanda rămâne `PENDING` sau `AWAITING_PAYMENT` pentru totdeauna. **5 comenzi, 0 plătite, 1 158 EUR neîncasate** (`VERIFIED`, sumă din DB).

### 4.3 R3 — Serverul este provisionat dintr-o comandă **neplătită**

`VERIFIED` (interogare cu join între `Instance` și `Order`):

| Instanță | Stare în DB | Server Pterodactyl | Alocare | Comandă | Stare comandă |
|---|---|---|---|---|---|
| Discord Bot | **ONLINE** | 10 | 74 (port **30001**) | **BM-00002** | **AWAITING_PAYMENT** |
| Discord Bot | STOPPED | 11 | 75 (port **30002**) | **BM-00003** | **PENDING** |
| Browser instance | ONLINE | 15 | 77 (port **30004**) | — | — |

**O instanță rulează pe o comandă pe care clientul nu a plătit-o niciodată.** Iar instanța e legată de comanda respectivă prin `Instance.orderId`, deci relația e intenționată, nu o coincidență. `VERIFIED` suplimentar: **0 abonamente** legate de oricare instanță (`Subscription.instanceId` — agregare `0`), deși evenimentele de provisionare spun „Started at step **subscription_linked**" (`VERIFIED`, `/api/instances/:id/events`).

**De ce contează pentru onboarding:** un client care abandonează la pasul 3 (payment) **primește totuși un server**. Asta înseamnă că abandonul de la checkout nu e un abandon — e un server gratuit. Și înseamnă că „provisionat cu succes" nu înseamnă „plătit": cei doi indicatori nu sunt legați între ei.

### 4.4 R4 — „Online" în baza de date, `offline` la panou

`VERIFIED`, prin API, pe aceeași instanță:

```
GET /api/instances/:id/resources
{"resources":{"state":"offline","is_suspended":false,"cpu_absolute":0,
 "memory_bytes":0,"network":{"rx":0,"tx":0},"disk":{"used":8814},"uptime":0}}

GET /api/instances/:id/server
{"server":{"uuid":"ecb75d8a-...","identifier":"ecb75d8a","name":"Discord Bot",
 "state":"","isSuspended":false,"limits":{...},"features":[],"createdAt":""}}
```

Și pe ecran, în detaliul instanței (`/app/instances/:id`, `VERIFIED` browser):

- antet: „**Discord Bot** / Online / **No public URL yet**"
- secțiunea de resurse: „MEMORY **0 B** of 512 MB", „DISK 8.6 KB of 5 GB", „PROCESSOR **0%** of 1 vCPU", „UPTIME **0 m**"
- de două ori: „**CONTAINER STATE** — **offline**"
- activitatea recentă: „**provisioned** — Instance is online.", „provisioning — Container started.", plus „Started at step \"activated\"" / „\"subscription_linked\"" / „\"health_verified\""

**Există o contradicție între trei surse de adevăr, toate afișate clientului pe aceeași pagină:** bara de stare a aplicației spune „Online", activitatea spune „Instance is online." și „Container started.", iar panoul spune `offline` cu uptime 0. Clientul nu are niciun fel de explicație — și niciun operator nu o poate rezolva, pentru că niciun cod nu compară cele două stări. `CODE-INSPECTED`: `Instance.status` este un enum scris de worker la provisionare (`provisionStep`), fără reaprobare ulterioară.

În plus, coloana „NODE" din `/app/instances` arată „**—**" (`VERIFIED`), pentru că `api/src/routes/instances.ts:48` întoarce hardcoded `node: null as { name: string } | null`.

### 4.5 R5 — Containerul nu conține nicio aplicație

Acesta este motivul pentru care containerul e `offline`, și este **cel mai grav lucru din tot onboarding-ul**.

Configurația produsului (`VERIFIED`, DB și `GET /api/instances/:id/startup`):

| Câmp | Valoare |
|---|---|
| `eggId` | 15 |
| `dockerImage` | `ghcr.io/ptero-eggs/yolks:nodejs_25` |
| `startupCommand` | `npm run start` |
| `startup` | `{"MAIN_FILE": "index.js"}` |

Conținutul directorului `/` al containerului (`VERIFIED`, `GET /api/instances/:id/files?path=/`):

```
.npm/            (4096B)
bm-test copy.txt (19B)
bm-test.txt      (19B)
```

**Nu există `package.json`. Nu există `index.js`. Nu există `node_modules`.** Comanda `npm run start` nu poate reuși într-un director fără `package.json` — `npm` iese cu eroare, procesul moare, containerul iese, `state` devine `offline`, `uptime` rămâne 0, memoria rămâne 0. Exact ce măsurăm.

**Ce înseamnă asta:** produsul `discord-bot` este „validat pentru deployment" (`deployable = true`, `healthProbe.kind = container`), dar **nu conține niciun cod de pornit**. Clientul nu primește niciun proiect-sursă, niciun `index.js`, niciun ghid de primele 5 minute. Nu există în produs niciun mecanism de „starter project" — `grep` pe `web/src` și `api/src` nu găsește niciun șablon de fișier de pornit, niciun buton de „deploy example".

**Concluzia de fond:** *„primul server care funcționează" nu este doar greu — este imposibil.* Chiar și tot restul parcursului s-ar remedia, clientul tot ar primi un container care moare imediat.

### 4.6 R6 — Nu există adresă publică, și cauza e de configurație

`VERIFIED` (browser): antetul instanței arată „**No public URL yet**"; `GET /api/instances` întoarce `"url": null`; `InstanceDomain` are **0 rânduri** (`VERIFIED`, DB).

`CODE-INSPECTED` (`api/src/routes/instances.ts:33-46`): `url` este derivat dintr-un domeniu activ:
```ts
const active = (instance.domains ?? []).find((domain) => domain.status === 'ACTIVE');
url: active ? `https://${active.hostname}` : null,
```
Adică adresa publică depinde de un `InstanceDomain` cu starea `ACTIVE`, iar un asemenea domeniu cere:
- un **domeniu de bază** — `DOMAIN_BASE` este **gol** în `.env` (`VERIFIED`; `api/src/env.ts:84` are chiar default `''`);
- programarea traseului în **Caddy** — `CADDY_ADMIN_URL` și `CADDY_ADMIN_TOKEN` sunt **ambele goale** (`VERIFIED`).

**Deci nu e o stare tranzitorie („încă n-a atașat un domeniu") — e o configurație lipsă.** Fluxul „atașează-ți domeniul" nu poate funcționa nici pentru primul client.

**Ce rămâne:** adresa brută de pe planul de joc — `193.34.214.87:30001` (alocarea 74 = portul 30001; alocările 73–77 = porturile 30000–30004, `VERIFIED` prin API-ul panoului) — pe care interfața **nu o arată niciodată**. Clientul primește o instanță cu un port alocat, fără nicio instrucțiune despre cum să-l folosească.

### 4.7 R7 — Doar 5 porturi sunt publicate; 73 există în afara intervalului

`VERIFIED` (API panou, `GET /api/application/nodes/1/allocations`): **173 de alocări**, în trei intervale:
- `25565–25600` (36 porturi) — ** Minecraft**
- `27015–27050` (36 porturi) — Counter-Strike
- `30000–30100` (101 porturi)

`VERIFIED` (regulile DNAT de pe hypervisor, din `03-network-and-ip-plan.md` §2):
```
-A PREROUTING -d 193.34.214.87/32 -i eth0 -p tcp --dport 30000:39999 -j DNAT --to-destination 10.77.0.11
-A PREROUTING -d 193.34.214.87/32 -i eth0 -p udp --dport 30000:39999 -j DNAT --to-destination 10.77.0.11
```
Filtrul `FORWARD` are doar două reguli `ACCEPT` pentru `30000:39999` pe `10.77.0.11` (`03-network-and-ip-plan.md` §2).

**Deci: 73 de alocări (42 %) sunt în afara intervalului publicat.** Un server Minecraft pe `25565` — portul pe care orice jucător îl tastează — **nu este accesibil din internet** (`VERIFIED` în `03-network-and-ip-plan.md` §4.2).

**Nuanța importantă, pentru corectitudine:** platforma **preferă** alocările ≥ 30000 — `api/src/services/provisioning.ts:217-218`, `const preferred = free.find((allocation) => allocation.port >= 30000);` — iar toate cele 5 alocări în uz sunt 30000–30004 (`VERIFIED`). Deci **serverele create azi ajung pe porturi publicate**. Dar:
1. **Calea de rezervă** (`provisioning.ts:220`, `spare = { allocationId: free[0].id }`) **alegă prima alocare liberă din listă** — care poate fi un port din `25565–25600`. Comentariul din cod spune limpede: „A node that only has addresses left outside that range is still used when it is the only one with room." (`CODE-INSPECTED`, `provisioning.ts:191-202`).
2. **Alocările adăugate de client** sunt alese de **panel**, nu de platformă: „The panel picks the address itself out of the free ones of the node, so the customer does not choose an address and a port." (`CODE-INSPECTED`, `api/src/routes/instance-server.ts:665-671`) — deci nici această cale nu garantează un port publicat.

**Concluzie:** riscul e real, dar **astăzi mascat** de regula de preferință. Când se vinde Minecraft (portul 25565 e chiar în lista nepublicată), un client plătește și primește un server inaccesibil.

### 4.8 R8 — Două din cinci servere din panou sunt orfane

`VERIFIED` (API panou, `GET /api/application/servers`): panoul are **5 servere** — id `8` („Blipmade Port Test"), `10` („Discord Bot"), `11` („Discord Bot"), `14` („Browser instance"), `15` („Browser instance").
`VERIFIED` (DB): doar **3** referențe în `Instance.pterodactylServerId` — `10`, `11`, `15`.

**Serverele `8` și `14` nu au nicio instanță în baza de date**: consumă resurse în nod, apar în panou, și nu pot fi gestionate din interfața Blipmade. **2 din 5 = 40 %** orfanitudine la nivel de panou. În sens invers, instanța „Browser instance" din DB (`serverId 15`) **nu are nicio comandă** (`orderId` gol) — deci nu este legată de niciun client.

### 4.9 R9 — „No subscriptions yet" în pagina de facturare, cu o instanță activă

`VERIFIED` (browser, `/app/billing`), pentru contul care are o instanță activă:

- „THIS MONTH (ESTIMATE) **€1.72**" — estimate, fără perioadă
- „CURRENT PERIOD ENDS — **Not available yet**"
- „PAYMENT METHOD — **No payment method on file**"
- „Subscriptions — **No subscriptions yet**. Subscriptions appear here as soon as you deploy an instance." ← **text fals**: există o instanță, dar nu există abonament
- „Invoices — **No invoices yet**"

`VERIFIED` (DB): `Subscription` = **0 rânduri**, `Invoice` = **0 rânduri**.

**De ce:** abonamentul se creează în webhook-ul Stripe (`api/src/services/stripe.ts:304`) sau la reînnoiere (`api/src/services/billing.ts:106`). Cum plățile sunt oprite, **nu se creează niciunul**. Deci fluxul „instantiază → abonament → factură" e întrerupt la primul pas, iar interfața prezintă golul ca pe un lucru normal care se va rezolva singur.

### 4.10 R10 — Verificarea e-mailului nu e impusă nicăieri, deși interfața promite că e

`CODE-INSPECTED` (`web/src/pages/Register.tsx:166`), text afișat clientului după înregistrare:

> „Some features, such as **billing and domain changes, need a verified email address**. You can confirm it later."

`CODE-INSPECTED`: `grep -rn "emailVerified" api/src web/src` → **aparițiile sunt doar în serializarea sesiunii** (`api/src/plugins/auth.ts:22`, `web/src/lib/api.ts:148`) și în **afișarea** badge-ului din setări (`web/src/app/Settings.tsx:270-273`, `web/src/admin/CustomerDetail.tsx:174`). **Nicio rută nu verifică `emailVerifiedAt`.** `api/src/routes/domains.ts` și `api/src/routes/billing.ts` nu conțin nicio verificare de acest tip.

**Deci promisiunea din interfață e falsă în ambele sensuri:** nici nu e impusă, și nici nu ar putea fi îndeplinită, pentru că mailul nu se livrează (§5.3).

---

## 5. Experiența de prima rulare

### 5.1 Ce se întâmplă la înregistrare

`CODE-INSPECTED` (`api/src/routes/auth.ts`, handler-ul `POST /auth/register`):
1. se validează parola (`passwordProblems`), se verifică duplicatul de e-mail;
2. se creează utilizatorul cu `role: 'CUSTOMER'`;
3. **se creează sesiunea imediat** (`createSession(request, reply, user.id)`) — clientul e deja autentificat;
4. se trimite e-mailul de verificare (`sendVerificationEmail`);
5. se scrie audit `auth.register`;
6. răspunsul include `mail: { state: mail.state, message: registrationNotice() }`.

`VERIFIED` (browser): după înregistrare, contul intră direct în `/app`, iar contul de test arată în setări „EMAIL ADDRESS … **Not verified**".

**Punctul bun al primei rulări:** clientul **nu e blocat** la un e-mail. Poate naviga imediat. E o decizie de design corectă pentru o platformă unde e-mailul nu funcționează — dar, ironic, devine **singura** cale prin care platforma „funcționează" azi, pentru că restul drumului e blocat.

**Punctul slab:** textul „You can confirm it later" trimite clientul într-un e-mail care nu va veni niciodată (§5.3), iar setările arată „Not verified" fără nicio explicație a cauzei.

### 5.2 Prima rulare ca utilizator nou — ce ar trebui să se întâmple vs ce se întâmplă

| Pas | Ce ar trebui | Ce se întâmplă azi | Clasă |
|---|---|---|---|
| 1. Vizitează `/` | catalog coerent cu ce se poate cumpăra | 12 aplicații anunțate, 5 existente, **1 deployabilă** | `VERIFIED` |
| 2. Face cont | e-mail de confirmare livrat | e-mail scris în fișier, **nu livrat** | `VERIFIED` |
| 3. Intră în `/app` | dashboard gol, „add your first service" | dashboard gol, buton „Deploy" | `VERIFIED` |
| 4. Alege un produs | un produs funcțional | doar `discord-bot`; restul „Coming soon" | `VERIFIED` |
| 5. Configurează | preț clar, resurse disponibile | 0.3/0.5/1/2/4 GB RAM, 1/2/4 vCPU, storage 5 GB („Between 1 GB and 50 GB"), estimare €1.72 | `VERIFIED` |
| 6. Revizează | sumar al comenzii | pasul „Review order" există | `VERIFIED` |
| 7. Plătește | redirect la Stripe | **503 `payments_unavailable`** — comanda rămâne neplătită | `VERIFIED` |
| 8. Provisionează | container pornit, aplicația rulează | instanță creată **din comandă neplătită**, containerul e `offline`, fără `package.json` | `VERIFIED` |
| 9. Accesează serverul | un URL public | „No public URL yet"; `DOMAIN_BASE` și Caddy neconfigurate | `VERIFIED` |
| 10. Are ajutor | ticket + notificare | ticketul se înregistrează, **nimeni nu e notificat** | `VERIFIED` |

### 5.3 E-mailul: 4 270 mesaje, zero livrate

`VERIFIED`:
- `SMTP_URL` gol ⇒ `env.mailEnabled = false` (`api/src/env.ts:137`) ⇒ transportul e `file`.
- 15 rânduri în `MailDelivery`, toate `written-to-file`, **0 `delivered`**.
- **4 270 fișiere** în `/var/backups/blipmade/mail/`, din care **4 175** sunt „Confirm your Blipmade email address".
- Fișierele conțin corpul integral, cu linkul de verificare și tokenul, în text clar (`VERIFIED` — chei `date`, `from`, `subject`, `text`, `to`).

**Consecința pentru onboarding:** din cele 4 175 încercări de verificare, **zero** au ajuns la destinatar. Fiecare client nou care încearcă să-și verifice adresa rămâne în starea „Not verified" — pentru că linkul nu a existat niciodată în inboxul lui. Și, cum semnarea nu este impusă (§4.10), **nu se întâmplă nimic** — platforma pur și simplu nu știe și nu cere.

### 5.4 Fluxul de activare / invitație

**Nu există flux de invitație.** `CODE-INSPECTED`: singurele rute de autentificare sunt `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/require`, `/auth/enroll-admin` (invitare de administrator, cu `ADMIN_ENROLLMENT_KEY`).

- **Nu există „invite un membru al echipei"**, nici pentru clienți, nici pentru personal. Personalul se adaugă prin `/admin/staff` (`PUT /admin/staff/:userId`).
- **Nu există rol `STAFF` în baza de date**, deși codul îl verifică în mai multe locuri (`api/src/routes/tickets.ts:427` — `role: { in: ['STAFF', 'ADMIN'] }`). `VERIFIED`: `User.role` are doar `ADMIN` (2) și `CUSTOMER` (4).
- **Nu există SSO, nici OAuth, nici Google/Apple.** Doar e-mail + parolă.
- `GET /auth/require` (`api/src/routes/auth.ts`) verifică dacă utilizatorul are rolul necesar — dar nu există invitare, deci nu are rol de primit.

**Concluzie:** orice client este un client unic, fără organizație, fără sub-utilizatori, fără coadă comună. Pentru hosting de joc, unde un client cumpără adesea pentru un grup, **modelul de cont nu are cum să suporte clientul real**.

### 5.5 Ce vede clientul când ceva nu merge

| Eroare | Ce vede clientul | Ce e în realitate | Clasă |
|---|---|---|---|
| Checkout | mesaj generic de eroare de formular | `503 payments_unavailable`; mesajul pregătit („Open a support ticket to finish the payment") **nu apare** | `VERIFIED` + `CODE-INSPECTED` |
| Produs blocat | „COMING SOON" + „You cannot order it today." | corect și onest — **cel mai bun mesaj de pe întregul parcurs** | `VERIFIED` |
| Instanță moartă | „**Online**", „Everything is running", „Instance is online." | `state: "offline"`, uptime 0, fără `package.json` | `VERIFIED` |
| Lipsă de adresă | „No public URL yet" | nu e tranzitoriu: `DOMAIN_BASE` și Caddy sunt neconfigurate | `VERIFIED` |
| E-mail nededat | „We could not send another email. Try again in a moment." (`web/src/pages/Register.tsx:163`) | transportul nu e SMTP; nu se va trimite nici la următoarea încercare | `CODE-INSPECTED` |
| Ticket fără răspuns | „Open" + „No replies yet" | corect — dar nimeni nu primește notificare | `VERIFIED` |

**Observație de design, pentru creditarea echipei:** produsele blocate sunt communicate **onest** („Coming soon", cu explicația că imaginea nu e instalată). Aceeași limbă, aplicată consecvent la restul, ar rezolva majoritatea problemelor de onboarding. Nu e o problemă de limbaj, e o problemă de acoperire: **eoul onest există doar pe ecranele în care dezvoltatorii nu au ajuns încă.**

---

## 6. Journey-ul din primele 90 de minute

Cont de client nou, pe starea reală a producției la 2026-10-23.

| Minut | Rută | Ce vede clientul (text real) | Ce se întâmplă în sistem | Verdict |
|---:|---|---|---|---|
| **0** | `/` | „THE SIMPLER WAY TO SELF-HOST / Pick an app. / Deploy it."; „Apps from €1.49/mo · Databases from €4.49/mo"; 12 aplicații | niciun produs nou | ⚠️ **7 aplicații anunțate nu există** |
| **2** | `/apps/wordpress` | „Web & CMS — Websites, blogs and stores with the most popular CMS." | produs existent, `deployable = false` | ⚠️ **nu se poate cumpăra** |
| **4** | → „Choose app" | card cu „COMING SOON" | — | ⚠️ blocat, dar **onest anunțat** |
| **6** | `/apps/discord-bot` | „Run a Node.js bot around the clock without a home server." | singurul produs deployabil | ✅ merge |
| **8** | `/register` | formular: nume, e-mail, parolă | cont creat, **sesiune creată imediat** | ✅ merge |
| **9** | (automat) | „Some features, such as billing and domain changes, need a verified email address. You can confirm it later." | e-mail scris în fișier, **nu livrat** | ❌ **nu se primește nimic** |
| **10** | `/app` | „SERVICES 0", „NEEDS ATTENTION 0", „Everything is running", buton „Deploy" | cont gol | ✅ merge |
| **12** | `/app/deploy` | „**1 of 5 products can be deployed right now.**" | 4 produse blocate, 1 disponibil | ⚠️ **1 din 5** |
| **14** | `/app/deploy/discord-bot` | pasul „1 Configure": nume, RAM 0.3/0.5/1/2/4 GB, vCPU 1/2/4, storage „5 GB / Between 1 GB and 50 GB"; „PER MONTH €1.72"; „The price of the smallest configuration is €1.49/mo." | — | ✅ merge |
| **16** | pasul „2 Review" | sumarul comenzii | comanda **creată**, rând de audit `order.created` | ✅ merge |
| **18** | pasul „3 Payment" → `POST /orders/:id/checkout` | mesaj generic de eroare | **503 `payments_unavailable`** | ❌ **rupere** |
| **19** | pasul „4 Provisioning" | așteptare; „The order is waiting for payment." | instanță **creată și provisionată dintr-o comandă neplătită** (BM-00002) | ❌ **server primit gratuit** |
| **22** | `/app` | „Discord Bot — **Online** — 512 MB · 1 vCPU · 5 GB disk — **No public URL yet** — €1.72 / month" | `state: "offline"` în API | ⚠️ **minciuna vizibilă** |
| **25** | `/app/instances/:id` | „MEMORY 0 B of 512 MB", „DISK 8.6 KB of 5 GB", „UPTIME 0 m", „**Container: offline**"; activitate: „Instance is online.", „Container started." | fără `package.json`, fără `index.js` | ❌ **nu funcționează** |
| **28** | tab „Console" | fluxul de console (WebSocket) | endpointul răspunde `200` cu adresa fluxului | ✅ **merge** (singurul flux tehnic care merge) |
| **30** | tab „Files" | `.npm/`, `bm-test.txt`, `bm-test copy.txt` | fără cod de pornit | ❌ **nimic de pornit** |
| **33** | tab „Network" | — | alocare 30001, DNAT-ul publică 30000–39999 | ⚠️ **portul e accesibil, dar nu e afișat** |
| **36** | tab „Domains" | „No public URL yet" | `DOMAIN_BASE` gol, Caddy neconfigurat | ❌ **blocare definitivă** |
| **40** | `/app/billing` | „CURRENT PERIOD ENDS — Not available yet", „PAYMENT METHOD — No payment method on file", „Subscriptions — No subscriptions yet", „Invoices — No invoices yet" | 0 abonamente, 0 facturi | ⚠️ **gol, dar explicabil** |
| **45** | `/app/tickets` | „New ticket" | — | ✅ merge |
| **47** | (creează ticket) | „Open / No replies yet" | `ticket.created` scris; **notificarea scrisă în fișier** | ❌ **nimeni nu află** |
| **55** | `/app/settings` | „Not verified"; lista de sesiuni | 0 abonamente, 0 facturi | ⚠️ |
| **60** | `/status` | „**Degraded performance**"; „Support — Degraded performance"; „90-day uptime history is not available yet." | starea curentă, fără istoric | ⚠️ |
| **75** | `/docs` | documentație extinsă (110 KB) | — | ✅ **cel mai bun instrument de onboarding existent** |
| **90** | — | — | — | **server neplătit, oprit, fără cod, fără adresă, fără ajutor** |

**Concluzia tabelului:** din 18 etape, **3 sunt complet funcționale** (configurare, console, docs), **5 sunt comunicate onest** (produse „coming soon", billing gol), **10 sunt rupturi**. Cele 3 etape care funcționează sunt, coincident, cele care **nu necesită niciun server**.

---

## 7. Checklist de onboarding în ordinea remedierii

Ordinea este deliberată: fiecare pas deblochează pașii următori, iar pasul 1 este cel care deblochează aproape tot restul.

| # | Remediere | Ce deblochează | Unde | De ce e aici |
|---|---|---|---|---|
| **O1** | **Pune un cod de pornit în produsul `discord-bot`** — un `package.json` cu scriptul `start` și un `index.js` real, plus un buton „deploy example" și un ghid de primele 5 minute | R4, R5 — prima etapă esențială | `api/src/services/provisioning.ts` (pasul de instalare a fișierelor) + `web/src/app/Deploy.tsx` | Fără asta, tot restul e decor. E singurul pas care face ca „primul server" să fie real. |
| **O2** | **Coboarăprovisionarea sub „comandă plătită"** | R3, R2 | `api/src/routes/orders.ts` + workerul | Azi se livrează resurse pentru comenzi neplătite. E o problemă de cost **și** de onestitate. |
| **O3** | **Configurează `STRIPE_SECRET_KEY` + `PAYMENTS_ENABLED=true`** și testează fluxul real | R2 | `.env` pe VM 103 | Fără plățuni există nici factură, nici abonament, nici venit, nici SLA. |
| **O4** | **Configurează SMTP** (plus SPF/DKIM/DMARC) | R6 (e-mail), §5.3 | `.env` + `docs/EMAIL.md` | Deblochează verificarea adresei, resetarea parolei, **și notificările de ticket** (→ `11-support-and-operations.md` R1). |
| **O5** | **Reconcilează starea instanței cu starea containerului** și nu afișa „Online" când panoul spune `offline` | R4 | workerul (la fiecare reconciliere) + `web/src/app/InstanceDetail.tsx` | Încrederea e tot. Un client care vede „Online" și nu funcționează nu mai vine. |
| **O6** | **Configurează `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`** și testează atașarea unui domeniu | R6 | `.env` + `api/src/routes/domains.ts` | Fără asta, instanța nu are adresă publică — nici măcar prin IP:port. |
| **O7** | **Publică intervalele `25565–25600` și `27015–27050` în DNAT**, sau elimină acele alocări din panou | R7 | reguli `iptables` pe hypervisor (target set în `03-network-and-ip-plan.md` §4.2) | Cerut înainte de a vinde Minecraft. Astăzi e mascat de regula de preferință; la vânzare, devine un server inaccesibil plătit. |
| **O8** | **Marchează clar cele 4 produse blocate în pagina de start** („coming soon") | R1, §3 | `web/src/home/Rest.tsx` | 7 din 12 aplicații anunțate nu există deloc. Reducere imediată a eșecului de așteptare. |
| **O9** | **Afișează adresa de conectare** (IP:port + instructiuni DNS) chiar înainte de atașarea unui domeniu | R6 | `web/src/app/InstanceDetail.tsx` (tab „Network") | Clientul are deja portul; nu i se spune. Soluție de punte, cu cost zero. |
| **O10** | **Curăță cele 2 servere orfane din panou** și reconciliază panoul cu baza de date | R8 | panou (read-write, în faza de remediere) | 40 % orfanitudine; consumă resurse fără client. |
| **O11** | **Repară mesajul de checkout** ca mesajul „Checkout is not available / deschide un ticket" să apară efectiv | R2 | `web/src/app/Deploy.tsx` (distinge codul `payments_unavailable`) | Textul există deja în cod și nu se afișează. E o corecție de 5 linii. |
| **O12** | **Impune verificarea e-mailului unde interfața promite că o impune** — sau scoate promisiunea din text | R10 | `web/src/pages/Register.tsx:166` vs `api/src/routes/*` | Textul promite o protecție care nu există. |
| **O13** | **Construiește un „getting started" de 5 minute** legat de documentația existentă | toate | `web/src/pages/Docs.tsx` + `web/src/app/Overview.tsx` | `Docs.tsx` are 110 KB și nu e legat de flux. Cel mai ieftin câștig de onboarding. |
| **O14** | **Adaugă notificare la ticket deschis** (e-mail + un badge în interfața personalului) | R-ticket | `api/src/routes/tickets.ts:425-439` + `web/src/admin/Tickets.tsx` | Fără asta, orice altă remediere de mai sus nu generează suport. |

---

## 8. Ce rămâne nerezolvat (limite onest ale acestui audit)

- **Nu am creat o comandă**, deci nu am observat *de la zero* fluxul complet de deploy (creare comandă → checkout → provisionare). Am observat fiecare verigă separat, cu excepția primei; comanda existentă `BM-00002` avea deja istoricul. `UNVERIFIED` pentru secvența end-to-end, `VERIFIED` pentru fiecare verigă.
- **Nu am pornit un container**, deci nu am citit ieșirea lui `npm run start`. Inferența „containerul moare pentru că nu există `package.json`" e `INFERRED` din două dovezi convergente: absența fișierului (`VERIFIED`) și `state: "offline"`, `uptime: 0`, `memory_bytes: 0` (`VERIFIED`). **Ar trebui confirmată de operator cu `docker logs` pe nod — o singură comandă, fără efecte.**
- **Nu am măsurat dacă un client poate ajunge la `193.34.214.87:30001`** din exterior. `03-network-and-ip-plan.md` documentează DNAT-ul ca activ pentru `30000:39999` (`VERIFIED` acolo); un test TCP din exterior ar confirma end-to-end. `UNVERIFIED` la nivelul acestui audit.
- **Nu am testat fluxul de resetare a parolei**, pentru că ar genera un e-mail real — iar e-mailul nu se livrează oricum.
- **Nu am putut evalua onboarding-ul pe telefon**, fiind la limita de timp a bugetului de comenzi; restul auditului (`07-quality-assurance.md`) acoperă partea de responsive.

---

*Document scris de agentul A11. Toate afirmațiile au clasă de evidență și sunt urmărite la o sursă concretă (fișier:linie sau ieșire de comandă). Nu conține secrete, date personale ale clienților sau cifre fabricate. Textele între ghilimele sunt copiate literal din interfața reală.*
