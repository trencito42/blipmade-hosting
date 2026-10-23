# 10 — Poziționare

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nu s-a făcut nicio comandă, nicio plată, nicio scriere în DB.
**Sursă unică a cifrelor:** `audit/09-financial-assumptions.md` (prin `audit/09-unit-economics.md` și `audit/09-pricing-recommendations.md`) și `audit/00-BRIEFING.md` §12.
**Clase de verificare:** cele din `00-BRIEFING.md` §0. Fiecare afirmație factuală poartă clasa și dovada (`fișier:linie` sau comanda + ieșirea).

> **Regulă de aur a acestui document:** poziționarea trebuie să fie compatibilă cu ceea ce poate fi livrat. Un enunț de poziționare care promite ceea ce auditul a găsit defect este un defect de marketing, nu un defect de vânzări. Așadar, în acest document, „diferențiator" înseamnă **ce se poate susține cu o dovadă**, nu ce ar putea fi adevărat.

---

## 1. Suma execuției — dilema centrală, într-un rând

**Blipmade se prezintă astăzi ca hosting PaaS de aplicații și baze de date („pick an app, deploy it"), dar infrastructura pe care stă este o instalație de game-hosting, iar catalogul vândut conține un singur produs real: un bot Discord Node.js.** `CODE-INSPECTED` + `VERIFIED`

Cele două jumătăți nu pot fi vândute în același moment, și niciuna dintre ele nu este completă:

| jumătate | stare | clasă | dovadă |
|---|---|---|---|
| **Brandul / promisiunea** | „freedom to run any app without configuring a VPS"; „We do not sell servers or RAM tables" | `CODE-INSPECTED` | `docs/BLIPMADE_DESIGN_PROMPT.md:9`, `:32` |
| **Implementarea brandului** | catalog public cu 5 produse, dintre care **1** este `deployable: true` | `VERIFIED` | `GET https://blipmade.com/api/catalog/products` — `discord-bot` are `deployable:true`, celelalte patru `deployable:false` |
| **Infrastructura reală** | nod de jocuri Pterodactyl cu 120 GiB RAM, 800 GiB disc, 173 alocări, 16 egg-uri (Minecraft, CS:GO, Rust, Mumble, TeamSpeak) | `VERIFIED` | `00-BRIEFING.md` §12.1 |
| **Baza de date a platformei despre acea infrastructură** | `Node` = 0 rânduri, `Egg` = 0 rânduri; `POST /admin/infrastructure/sync` **nu a fost rulat niciodată** | `VERIFIED` | `00-BRIEFING.md` §12.2 |
| **Porturile de joc** | DNAT-ul publică `30000:39999`; panoul alocă `25565–25600` și `27015–27050`, **dar provisionarea preferă deja o alocare cu `port >= 30000`** ⇒ un server Minecraft ar fi accesibil, pe `node1.blipmade.com:30012`, **nu pe 25565** | `VERIFIED` | `api/src/services/provisioning.ts:218` (`free.find((a) => a.port >= 30000)`); `audit/08-product-portfolio.md` §6.1, §6.3 |
| **Livrarea unui produs** | 0 din 5 produse pot fi cumpărate și livrate end-to-end | `VERIFIED` | `audit/04-product-certification.md` §3.6, §4.1 |

**Concluzia de poziționare:** poziționarea de brand este corectă și coerentă cu interfața construită; ea devine însă **mincinoasă în prima propoziție** („run any app") cât timp patru din cinci aplicații nu pot fi comandate. Poziționarea trebuie deci să fie îngustată acum la **ceea ce există**, și extinsă abia după poarta de lansare.

---

## 2. Categoria

### 2.1 Categoria aleasă de produs: **managed application hosting (PaaS)**

Cuvintele-cheie ale categoriei sunt deja scrise de echipa însăși, în documentul de identitate al brandului:

> „Blipmade sells **freedom to run any app without configuring a VPS**. We do not sell servers or RAM tables. The product is: pick an app, set resources, deploy, then manage it from one calm dashboard." — `docs/BLIPMADE_DESIGN_PROMPT.md:9` (`CODE-INSPECTED`)

Vocabulul de produs impus acolo: **App**, **Database**, **Instance**, **Resources**, **Dashboard**; interdicția explicită de a folosi „server", „VPS" și „plan" decât pentru a spune că le înlocuim (`docs/BLIPMADE_DESIGN_PROMPT.md:32`). Copy-ul public respectă deja această regulă în peste 20 de suprafețe (`web/src/home/Hero.tsx:56`, `web/src/home/Ticker.tsx:5`, `web/src/home/Configurator.tsx:36`, `web/src/pages/Login.tsx:125`, `web/src/pages/Register.tsx:38`).

**De ce această categorie este cea corectă pentru starea de acum:**

- prețul este per resursă și **nu per „plan"** — `ProductPrice` are `ramPerGb`, `cpuPerUnit`, `diskPerGb` și nu are rânduri de plan (`api/prisma/schema.prisma:259-273`; `CODE-INSPECTED`);
- clienții își aleg resursele într-un wizard cu **255 configurații**, toate cotate identic de server (`00-BRIEFING.md` §12.3; `VERIFIED`);
- interfața are o singură zonă de lucru („Dashboard"), nu un panou de administrare de server (`web/src/nav.ts`; `CODE-INSPECTED`).

### 2.2 Categoria pe care infrastructura ar permite-o — și de ce nu poate fi adoptată acum

`games-node-01`, 120 GiB de RAM, 173 alocări și egg-urile Minecraft / CS:GO / Rust / Mumble / TeamSpeak ar permite o categorie **game hosting**. Această categorie este astăzi **inutilizabilă comercial**, din patru motive independente, fiecare suficientă singură:

1. **Nu există produse de joc în catalog.** Cele 5 produse sunt `code-server`, `discord-bot`, `postgresql`, `uptime-kuma`, `wordpress` (`VERIFIED`, catalog live). Niciunul nu este un joc. `08-product-portfolio.md` §10 clasifică `minecraft-paper` (E1) și `vanilla` (E2) ca `LAUNCH-AFTER-FIX`, adică **nu există încă**.
2. **Nu există backup, iar produsele de joc sunt stateful.** `feature_limits.backups = 0` pe toate cele 5 servere; `OFFSITE_TARGET` nesetat. `08-product-portfolio.md` §7: „Minecraft nu trebuie vândut fără backup — o lume pierdută înseamnă un client pierdut și un review negativ."
3. **Nu există protecție DDoS.** Doar `blipmade.com` și `www.` sunt prin Cloudflare; `node1.` și `panel.` sunt DNS-only. Toți cei trei concurenți români documentați pun anti-DDoS în planul de intrare, iar Aternos îl dă gratuit. `08-competitive-analysis.md` §6.2: „vinderea unui server Minecraft public fără filtrare DDoS, într-o piață în care toți competitorii o includ, nu e o poziționare — e o vulnerabilitate de vânzare."
4. **Plățile sunt oprite.** `POST /api/orders/:id/checkout` → `503 payments_unavailable` (`api/src/services/stripe.ts:150-153`; `VERIFIED`).

> **Corectură necesară, și e importantă:** afirmația „un server Minecraft pe 25565 nu ar fi accesibil" e **adevărată dar prea largă** dacă e folosită ca motiv de a nu vinde jocuri. `provisioning.ts:218` preferă deja o alocare din blocul publicat `30000:39999`, deci un server Minecraft **ar ajunge accesibil din internet**, pe `node1.blipmade.com:30012`. Portul ar fi **neobișnuit**, nu absent. Motivele reale de blocaj sunt cele de mai sus: **produs inexistent, backup inexistent, DDoS inexistent** — nu portul. `VERIFIED` — `api/src/services/provisioning.ts:218`; `audit/08-product-portfolio.md` §6.3

> **De ce contează alegerea categoriei acum:** categoria decide pentru ce se caută și pentru cine se plătește. Dacă brandul rămâne pe „orice aplicație", efortul de marketing se duce către o audiență care încearcă să cumpere WordPress — un produs care **nu poate fi comandat** (serverul îl refuză cu 400, `api/src/services/pricing.ts:104`; `CODE-INSPECTED`). Tot acel efort se pierde la checkout, pentru că plățile sunt oprite. Orice campanie de volum declanșată acum generează comenzi eșuate, nu clienți.

---

## 3. Decizia de poziționare recomandată

**Poziția de bază (acum, înainte de poartă):**

> **„Managed Node.js hosting for people who need one small thing running all the time — and want to stop thinking about the machine."**

Unde „one small thing" este, onest, **un bot Discord** — singurul produs care se poate provisiona (`VERIFIED`, `audit/04-product-certification.md` §4.2).

**De ce nu „hosting pentru orice aplicație" ca poziție de bază acum:**

| afirmație | starea reală | clasă |
|---|---|---|
| „rulează WordPress, Uptime Kuma, PostgreSQL, Code Server" | 4 din 5 **nu pot fi comandate** — refuzate server-side cu 400 | `VERIFIED` (`04-product-certification.md` §4.3) |
| „any app" | catalogul are 5 produse, nu „orice" | `VERIFIED` (catalog live) |
| „scale as you grow" (copy hero) | scalarea există **ca mecanism** (`api/src/routes/instances.ts:268-301`), dar nu a fost exercitată pe o plată reală | `CODE-INSPECTED` |

**Poziția de extindere (după poarta de lansare, toate cele 9 condiții din `audit/16-GO-NO-GO-DECISION.md` §4):**

> **„Managed hosting for the apps and databases you actually use — one dashboard, one bill, one place to look."**

game hosting devine disponibil **doar** dacă se repară, în plus, backup-ul off-host, protecția DDoS, se creează produsele de joc cu egg real **și** se decide ce port se dă clientului (vezi mai jos). Niciunul dintre aceste lucruri nu există azi (`VERIFIED`).

### 3.1 Cele două rute de lansare documentate — și de ce documentele nu se agreează

La momentul redactării au apărut în paralel două seturi de documente cu **modele de cost incompatibile**, care ajung la **concluzii opuse** despre același produs. Le redau, pentru că poziționarea de mai sus depinde de alegerea dintre ele.

| | **Ruta `09-*` + `16-`** | **Ruta `08-*`** |
|---|---|---|
| **produsul de lansare** | `discord-bot` | `minecraft-paper` (E1) |
| **prețul** | **€9.99/lună** la 512 MB / 1 vCPU / 5 GB (`baseAmount = 976`) | **€4.09** (4 GB / 1 vCPU / 25 GB), **€4.49** (4 GB / 2 vCPU), **€5.99** (6 GB / 2 vCPU / 40 GB) |
| **modelul de cost** | **marginal, per client**: `contribuție(P) = 0,97·P − 5,50`, unde `5,00` e costul de suport (15 min/client/lună la 20 €/h) + `0,25` backup + comisioane | **alocat pe nod**: `P_floor = C_node / N_safe`, cu `C_node ≈ €54,44` (INFERRED, din prețul unui VPS Contabo) |
| **pragul** | **€5.67/client/lună** | **€3.40** la 16 instanțe × 1 vCPU; **€6.81** la 8 instanțe × 2 vCPU |
| **break-even** | **15 clienți** | **14 instanțe** (numai la 1 vCPU fiecare) |
| **piața** | niciuna documentată | **Minecraft hosting România**, cu 3 furnizori și prețuri publice |
| **verdictul despre bot** | **merge** la €9.99 (+€4,19 contribuție) | **nu trece niciodată**: „pragul e peste prețul de listă și peste prețul de intrare al pieței (€0 la Lunafy)" |

**Divergența are o cauză identificabilă, nu o eroare de aritmetică:** cele două modele omit costuri diferite. `08-product-launch-order.md` §7.4 **nu include costul de suport per client** (€5,00/lună la 15 min), pe care `09-unit-economics.md` îl include și îl justifică cu date reale (12 tichete deschise pentru 6 utilizatori, un singur operator). În plus, `08-product-launch-order.md` §7.4 punctul 6 spune explicit că **nici costul platformei, nici IP-ul, nici licențele nu sunt documentate**, deci „**pragul real e mai mare decât cel calculat**".

**Cum rezolvă, la rândul lui, documentul de decizie:** `audit/16-GO-NO-GO-DECISION.md` §5 și §6 optează pentru **€9.99** („Cardul de preț se schimbă înainte, la €9.99, sau lansarea nu are model economic"), iar Scenariul B (beta privat, plată manuală, maximum 10 clienți) confirmă „prețul de fundare e fix și negociat manual, în jurul lui €9.99". **Documentul de decizie, cel mai recent și cel mai explicit, sidează cu ruta `09-*`.**

**Cum se vede asta în marketing — cele două lucruri pe care le-am schimbat în acest set de documente:**

1. **copy-ul de lansare rămâne pentru `discord-bot` la €9.99**, aliniat cu `09-pricing-recommendations.md` §2.2 și cu `16-GO-NO-GO-DECISION.md` §5, așa cum cere sarcina;
2. **ruta `08-*` este documentată ca **Faza 2** — game hosting — cu precondițiile ei specifice:** backup off-host, protecție DDoS, un rând `Product` nou pentru `minecraft-paper`, și o decizie de preț între €4.09 și €4.49;
3. **o corecție de fapt, verificată în cod:** portul. `provisioning.ts:218` preferă deja o alocare cu `port >= 30000`, deci un server Minecraft **ar fi accesibil** — pe `node1.blipmade.com:30012`, nu pe `:25565`. Blocajul de port e **real, dar e o fricțiune de UX, nu o inaccesibilitate**. `VERIFIED`

> **Dacă operatorul alege ruta `08-*`,** copy-ul de lansare din `10-launch-copy.md` **nu se publică ca atare**: el descrie `discord-bot`. Este nevoie de un set nou de blocuri pentru `minecraft-paper`, cu prețul €4.09, cu mențiunea explicită a **backup-ului și a protecției DDoS** (care devin obligatorii, nu opționale) și cu portul non-standard explicat în documentație și în e-mailul de activare (`audit/08-product-portfolio.md` §6.3).

---

## 4. Segmentele ICP

Fiecare segment de mai jos are **un singur produs** care îl poate servi, în starea curentă. Segmentele sunt derivate din **ce se poate vinde efectiv**; concurența, documentată acum în `audit/08-competitive-analysis.md` §2, e folosită pentru a **califica** segmentele (cine plătește, la cât, cu ce inclus), nu pentru a le inventa.

> **Actualizare, cu dată:** `audit/08-competitive-analysis.md` **exista acum**; la prima redactare a acestui document nu exista, iar afirmația „nu se poate numi niciun concurent" era corectă. Concurenții și prețurile lor sunt în §5.1, cu precizarea de clasă.

| # | Segment | Produsul care îl servește | Dimensiune | Ce îl blochează acum | clasă |
|---|---|---|---|---|---|
| **S1** | **Autor de bot Discord** cu un proiect personal sau de comunitate: vrea un bot Node.js/Python pornit permanent, fără să-și țină PC-ul deschis | `discord-bot` | 256 MB – 4 GB RAM, 1–4 vCPU, 1–50 GB disc | **doar plățile** (B1, B5, B6 din `05-commerce-and-billing.md` §8) | `VERIFIED` (`04-product-certification.md` §4.2) |
| **S2** | **Persoană care vrea să-și auto-găzduiască WordPress / Uptime Kuma / PostgreSQL / Code Server** | cele 4 produse `deployable:false` | — | **produsul nu există ca runtime**: fără egg, fără imagine, fără comandă de pornire; comanda e respinsă cu 400 | `VERIFIED` (`04-product-certification.md` §4.3) |
| **S3** | **Jucător care vrea un server Minecraft găzduit în România** | niciunul | — | **patru blocaje independente**: (1) nu există produs de joc în catalog — E1/E2 sunt `LAUNCH-AFTER-FIX`; (2) **nu există backup** și produsele de joc sunt stateful — o lume pierdută înseamnă un client pierdut; (3) **nu există protecție DDoS**, deși toți cei trei concurenți RO o includ; (4) plățile sunt oprite | `VERIFIED` (`audit/08-product-portfolio.md` §7, §10; `audit/08-competitive-analysis.md` §6.2) |
| **S3-bis** | **Jucător care vrea CS 1.6 / Rust / TS3** | niciunul | — | aceleași blocaje + **provisionare multi-alocare**: Rust cere 4 porturi, TS3 cere 5, iar provisionarea actuală dă **o singură alocare** pe server (`api/src/services/provisioning.ts:484`) | `VERIFIED` (`audit/08-product-portfolio.md` §6.2) |
| **S4** | **Client care caută „hosting cu resurse și preț afișat înainte de checkout"** | orice, după reparare | — | prețul e corect și transparent înainte de plată (poarta 10 = 🟢 GREEN), dar nu se poate plăti | `VERIFIED` (`07-release-gates.md` poarta 10) |
| **S5** | **Cumpărător de plan anual / cu reducere de lansare** | — | — | **nu există plan anual** (`YEARLY` niciun rând, niciun cod care îl creeze, `pricing.ts:69-79`) și **reducerea nu ajunge la Stripe** (B1) | `CODE-INSPECTED` / `NOT-IMPLEMENTED` |

### 4.1 Segmentul care merită finanțat acum: **S1**

`discord-bot` este singurul produs cu `deployable: true`, singurul cu egg real (egg 15 „node.js generic"), iar lanțul de provisionare este **dovedit pe servere reale** (`audit/04-product-certification.md` §3.1, §3.6). Celelalte patru produse nu au nici măcar un runtime.

În plus, `discord-bot` are și cea mai bună formă economică de pe card:

| proprietate | valoare | clasă |
|---|---|---|
| preț recomandat | **€9.99/lună** pentru configurația implicită 512 MB / 1 vCPU / 5 GB | `VERIFIED` (`09-pricing-recommendations.md` §2.2) |
| contribuție | **+€4.19/client/lună** (+41.9%) | `VERIFIED` (`09-unit-economics.md` §3.4) |
| payback @ CAC €25 | **5.97 luni** | `VERIFIED` (`09-unit-economics.md` §5) |
| LTV @ churn 5% | **€83.81**, LTV/CAC **3.35** | `VERIFIED` (`09-unit-economics.md` §6) |
| break-even platformă | **15 clienți** | `VERIFIED` (`09-unit-economics.md` §13) |
| încap pe nod | **16 instanțe** (limitant: vCPU) | `VERIFIED` (`03-capacity-model.md` §2.4) |

**S1 este singurul segment care poate închide bugetul de achiziție din venitul propriu.** La prețurile curente ale cardului (€1.49–€5.90), contribuția este negativă la orice configurație: la €1.72 (prețul celor 3 instanțe vii) contribuția este **−€3.83/client/lună**, adică platforma plătește pentru fiecare client pe care îl servește (`VERIFIED`, `09-unit-economics.md` §3.4).

### 4.2 Segmentul care trebuie **amânat**, nu ignorat: **S3 (game hosting)**

S3 este **cel mai bine documentat** ca piață — trei furnizori români cu prețuri publice, plus Aternos gratuit — și, totuși, **cel mai greșit de vândut acum**. Argumentul „vindem ce avem, nu ce vrem" e aici deosebit de puternic, dar **motivul nu e portul**: un client care plătește pentru un server Minecraft **fără backup** își pierde lumea, iar unul care plătește pentru un server **fără DDoS**, într-o piață în care toți competitorii îl includ, e un client care pleacă și lasă o recenzie publică negativă — într-o platformă cu `0` abonamente și `0` recenzii, deci nicio recenzie anterioară care să o compenseze.

---

## 5. Alternativele pe care le pot evidenția

> **Limită explicită, pentru A1–A3:** în **repository** nu apare niciun nume de concurent și niciun preț de concurență (`grep` pe tot repo-ul pentru nume de furnizori de VPS/hosting: zero rezultate). Alternativele A1–A3 se deduc din **cod și din documentația de brand**, nu din prețuri de piață. Concurenții **numiți**, cu preț, apar în §5.1, pe baza lui `audit/08-competitive-analysis.md`, apărut ulterior în aceeași sesiune.

| alternativă | unde e numită | cum o poate dovedi platforma | diferența demonstrabilă |
|---|---|---|---|
| **A1. „Un VPS pe care îl configurezi singur"** | `docs/BLIPMADE_DESIGN_PROMPT.md:9` („without configuring a VPS"); `web/src/home/Hero.tsx:56` („No VPS setup"); `web/src/home/Ticker.tsx:5` („No VPS"); `web/src/home/Configurator.tsx:36` | este **alternativa implicită a întregului brand** | Blipmade elimină pasul de configurare a sistemului și de întreținere: resursele se aleg din wizard, prețul se vede înainte de checkout, upgrade-ul de resurse se face din panou (`api/src/routes/instances.ts:268-301`; `CODE-INSPECTED`) |
| **A2. „Un panou Pterodactyl găzduit de tine"** | platforma **este** Pterodactyl: `panel-bridge/`, `api/src/services/pterodactyl/` | este **alternativa tehnică reală**, pentru cine știe ce e Pterodactyl — și, în segmentul de jocuri, este chiar **panoul concurentului Zentaris** | Blipmade împachetează Pterodactyl cu un panou client, catalog, preț și suport cu tichete; alternativa cere administrare proprie de panou, de șuvițe, de alocări și de backup — toate absente din produsul de azi al alternativei |
| **A3. „Un provider de cloud generic, cu o mașină virtuală"** | se deduce din `A1` (același termen, „VPS") | se deduce din același text | preț afișat înainte de checkout, fără cost de configurare |

### 5.1 Concurenți **numiți** — date apărute în timpul acestei sesiuni

> **Actualizare, cu dată.** La momentul primei redactări a acestui document, `audit/08-competitive-analysis.md` **nu exista**, iar alternativa „nu poate fi numit niciun concurent" era corectă. Fișierul a apărut ulterior, în aceeași sesiune de audit, și **conține prețuri citite din surse live pe 2026-10-23**. Le-am preluat, cu precizarea căle de clasă:
> **clasa mea pentru aceste prețuri este `DOCUMENTED-ONLY`** — documentate și verificate de un agent sibling pe sursele indicate, dar **eu nu le-am re-citit în această sesiune**. Nu am niciun preț de concurență citit direct de mine.

| concurent | segment | preț de intrare | ce include la prețul de intrare | clasă |
|---|---|---:|---|---|
| **Aternos** (`aternos.org`) | Minecraft | **€0** | „Minecraft servers. Free. Forever." · DDoS complet gratuit · backup-uri gratuite în cloud | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §3) |
| **OVINETWORK** (`ovinetwork.ro/hosting-minecraft`) | Minecraft RO | **€3.99/lună** — 4 GB / 2 nuclee / 25 GB NVMe | Anti-DDoS 1 Tbps · uptime 99,95% declarat · „peste 10 ani" | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §2.1) |
| **Zentaris Host** (`zentaris-host.ro/hosting-jocuri/minecraft/`) | Minecraft RO | **€4.49/lună** — 4 GB / 2 vCPU / 25 GB SSD | Anti-DDoS · sloturi nelimitate · **panou Pterodactyl** · suport 7 zile din 7 | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §2.2) |
| **Torchbyte** (`torchbyte.com/ro/game/minecraft`) | Minecraft RO | **€4.74/lună** — 4 GB / 2 vCPU / 50 GB NVMe | **+ 50 GB backup** · DDoS ajustat pentru Minecraft · prețuri cu TVA inclus | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §2.3) |
| **Lunafy** | Minecraft / bot | **€0** (intrare) | — | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §2, `08-product-launch-order.md` §7.4) |
| **Zentaris — CS 1.6** | CS 1.6 RO | **€3.49/lună** (16 sloturi) | Anti-DDoS · activare instantă | `DOCUMENTED-ONLY` (`08-competitive-analysis.md` §2.4) |

**Ce se schimbă, concret, în poziționare:**

1. **Segmentul de intrare al pieței de jocuri are un reper gratuit** (Aternos: gratuit, cu DDoS și cu backup). ⇒ **Blipmade nu poate câștiga pe preț acest segment** și, azi, **nici pe DDoS sau backup**, pentru că nu le are. `08-competitive-analysis.md` §3.
2. **Toți cei trei concurenți români includ anti-DDoS la prețul de intrare**, iar Torchbyte include și backup. ⇒ **DDoS-ul și backup-ul nu sunt diferențiatori, ci lipsuri.** `08-competitive-analysis.md` §6.2.
3. **Zentaris folosește același panou ca Blipmade (Pterodactyl)** ⇒ tehnologia **nu** e diferențiatorul; diferențiatorul poate fi doar produsul și experiența. `08-competitive-analysis.md` §2.2
4. **OVINETWORK declară 99,95% uptime** ⇒ orice cifră de uptime publicată de Blipmade va fi comparată cu una deja existentă în piață; de aceea **nicio cifră de uptime nu se publică până nu există un raport propriu** (`10-growth-metrics.md`, M30).

**Ce nu se poate afirma despre alternative:** nicio cotă de piață, niciun volum de recenzii (Trustpilot a răspuns 403 la citire — `NOT-VERIFIED`), niciun SLA scris al concurenților, niciun număr de clienți al lor, nicio cifră de uptime **verificată** a concurenților (a lui OVINETWORK e **declarată**, nu măsurată).


---

## 6. Matricea de poziționare

Construim matricea pe **ce poate fi dovedit**, nu pe preferințe. Axa orizontală: *cât de multă infrastructură trebuie să știe clientul*. Axa verticală: *cât de profundă este integrarea cu produsul aplicației* (de la „docker run și nu te mai uiți" la „pawn cu un panou și un launcher").

```
                          INTEGRARE DE PRODUS (adâncime)
                                  ▲
                                  │
   NEAM / UI   [A1 VPS]          │        ┌───────────────────────────────────┐
   pe care     [A3 Cloud]        │        │  BLIPMADE AZI — discord-bot        │
   clientul    [A2 Pterodactyl]  │        │  catalog: 1 produs deployable     │
   trebuie să   [Docker Compose] │        │  preț: €1.49–€5.90 curent        │
   o știe                       │        │  POZIȚIONARE: „one small thing,   │
       │                        │        │  running all the time"            │
       │                        │        │  ★ RAȚIUNE: plățile oprite      │
       │                        │        └───────────────────────────────────┘
       │                        │
       └────────────────────────┼──────────────────────────────────────────────▶
                                │  CUNOȘTINȚE DE INFRASTRUCTURĂ
                                │  NECESARE CLIENTULUI (mic → mare)
```

**Citirea matricei:**

| celulă | ocupant | verdict |
|---|---|---|
| jos-stânga (puțină cunoaștere, integrare zero) | Docker Compose pe un VPS | alternativă reală, dar cu tot costul de configurare |
| jos-dreapta (cunoaștere mare, integrare bună) | **Blipmade azi, cu `discord-bot`** | **poziția reală de azi**: produsul e integrat (egg, imagine, startup), darecosumul de cunoaștințe cerut clientului e mic |
| dreapta-sus | **Blipmade țintă** (după poartă: `wordpress`, `postgresql`, `uptime-kuma`, `code-server` + jocuri) | **neocupată azi**; toate cele patru celule de sub ea sunt `deployable:false` sau inaccesibile |

**Cele două concurenți de jocuri documentate se așază în stânga-sus**, nu în dreapta-sus: Aternos, OVINETWORK, Zentaris și Torchbyte oferă **produsul** (un server Minecraft), dar clientul lor nu gestionează niciun container, niciun preț calculat, niciun dashboard. Diferența pe care Blipmade o-ar putea construi pe această piață **e de integrare și de transparentanță a prețului**, nu de produs — și numai după ce backup-ul și DDoS-ul există. `DOCUMENTED-ONLY` (`audit/08-competitive-analysis.md` §2–§3, §6.2)

**Observația esențială:** matricea arată că poziționarea actuală a brandului („orice aplicație, fără VPS") promite **întreaga coloană din dreapta**, dar platforma ocupă astăzi **o singură celulă** din acea coloană. Diferența dintre promisiune și realitate nu este o problemă de copy — este o problemă de **catalog**.

---

## 7. Ce poate afirma platforma **azi** vs. ce poate afirma **după poartă**

### 7.1 Afirmații permise **azi** (toate `VERIFIED` sau `CODE-INSPECTED`)

| afirmație | dovada | de ce e sigură |
|---|---|---|
| „Alegeți resursele, vedeti prețul înainte de checkout." | 255/255 configurații cotate identic de server și de browser (`00-BRIEFING.md` §12.3); poarta 10 = 🟢 GREEN | motorul de preț e corect; poarta de preț nu e defectă |
| „Facturare lunară." | `BillingPeriod` are `MONTHLY \| YEARLY`, toate rândurile `MONTHLY`; `mode: 'subscription'`, `interval: 'month'` (`stripe.ts:172-179`) | se poate spune „lunar"; **nu** „anual" |
| „Un singur cont pentru aplicații, domenii, tichete și facturare." | `web/src/pages/Login.tsx:125`; rutele există în `api/src/routes/settings.ts` | text de interfață, adevărat ca funcționalitate |
| „Resurse: memorie, vCPU, disc." | `Product.minRam/minCpu/minDisk`, `Instance.ram/cpu/disk` | vocabularul brandului (`BLIPMADE_DESIGN_PROMPT.md:32`) |
| „Prețul pornește de la €1.49." | cardul curent, `VERIFIED` | eticheta „Starting price" e corectă în toate suprafețele (`05-pricing-consistency.md` §6) |
| „Suport prin tichet." | 8 rute de tichete, 13+9 teste, 12 tichete live (`00-current-state.md` §3.6) | **nu** spune „răspuns în X minute" — vezi mai jos |

### 7.1 bis Cardul de preț real, pentru ca poziționarea să nu fie citită în afara contextului

`price = baseAmount + ((ram − minRam)/1024)·ramPerGb + (cpu − minCpu)·cpuPerUnit + (disk − minDisk)·diskPerGb`,
cu `baseAmount = 149`, `ramPerGb = 60`, `cpuPerUnit = 40`, `diskPerGb = 2`, `min = (256, 1, 1)` — **supraclășugile se aplică peste minimul produsului, nu peste zero**. `VERIFIED` (`00-BRIEFING.md` §12.3; `api/src/services/pricing.ts:39-53`)

| configurație | preț | observație |
|---|---:|---|
| 256 MB / 1 vCPU / 1 GB (minimul produsului) | **€1.49** | „Starting price" — eticheta e corectă în toate suprafețele (`05-pricing-consistency.md` §6) |
| 512 MB / 1 vCPU / 5 GB (implicitul) | **€1.72** | prețul celor 3 instanțe vii |
| 4 GB / 2 vCPU / 20 GB | **€4.52** | **nu e selectabil în wizard**: pasul de disc sare 3 → 19 GB, deci se oferă €4.50 (19 GB) și €4.56 (22 GB) |
| maxim selectabil (4 GB / 4 vCPU / 49 GB) | **€5.90** | plafonul cardului |

`VERIFIED` — toate cele 255 de configurații oferite de wizard au fost cotate live și **toate au corespuns formulei**.

**Cardul curent (€1.49–€5.90) stă integral sub pragul de contribuție-zero de €5.67.** De aceea poziționarea recomandată în §3 nu este „hosting ieftin" — este „găzduire cu preț transparent, la prețul la care modelul se închide". Prețul recomandat rămâne **€9.99/lună** pentru configurația implicită a lui `discord-bot` (`audit/09-pricing-recommendations.md` §2.2), iar **diferența dintre cardul actual și prețul recomandat este o decizie de lansare, nu o afirmație de marketing**.

### 7.2 Afirmații **interzise** azi (fiecare are un contra-adevăr verificat)

| nu spune | de ce | clasă |
|---|---|---|
| „Rulează WordPress / PostgreSQL / Uptime Kuma / Code Server." | 4 din 5 sunt `deployable:false`, comanda e respinsă cu 400 | `VERIFIED` |
| „O platformă pentru orice aplicație." | catalogul are 5 produse, 1 real | `VERIFIED` |
| „Servere de joc." | **nu** — dar motivul nu e portul: nu există produs de joc, nu există backup (produsele de joc sunt stateful) și nu există DDoS, deși toți concurenții RO îl includ | `VERIFIED` (`audit/08-product-portfolio.md` §7, §10; `audit/08-competitive-analysis.md` §6.2) |
| „Facturare anuală." | nu există plan `YEARLY` | `NOT-IMPLEMENTED` |
| „50% off / primii 50 de clienți." | B1: reducerea nu ajunge la Stripe → comanda **eșuează**; și `maxPerUser` e cod mort → „primii 50 eligibili" nu e limitabil per cont | `CODE-INSPECTED` |
| „24/7 support." | nu există program publicat de timp de răspuns; FAQ-ul spune „Response times will be published before launch" (`web/src/data.ts:40`) | `DOCUMENTED-ONLY` |
| „99,9% uptime / SLA." | nu există niciun raport de uptime în sistem; backup-ul nu e programat, iar `OFFSITE_TARGET` nu e setat | `NOT-IMPLEMENTED` |
| „Domenii incluse." | `InstanceDomain` = 0 rânduri; API-ul Caddy nu a fost chemat niciodată (`CADDY_ADMIN_URL`/`CADDY_ADMIN_TOKEN` goale) ⇒ **niciun domeniu de client nu a fost rutat vreodată** | `VERIFIED` (`00-current-state.md` §3.4) |
| „Trial gratuit." | `grep -rn "coupon\|Coupon\|trial" api/src` → zero rezultate | `NOT-IMPLEMENTED` |
| „„De încredere, cu X clienți"." | `0` abonamente, `0` facturi, `0` plăți | `VERIFIED` |
| „Deploy instant / în 10 secunde." | 30 joburi `failed` din 123 (24%); 80 `instance.provision_failed` vs 5 `instance.provisioned` | `VERIFIED` (`07-release-gates.md` poarta 5) |

### 7.3 Afirmații care devin permise **după** poarta de lansare

Toate cele 9 condiții din `audit/07-release-gates.md` §3 trebuie îndeplinite, nu un subset. În plus, pentru a spune „găzduim jocuri", trebuie reparat și intervalul DNAT (`audit/03-network-and-ip-plan.md` §4.2) și rulat `POST /admin/infrastructure/sync` (o schimbare de stare, deci o deciție de operator, nu un pas de audit).

| după poartă | condiția prerezică |
|---|---|
| „Plăți reale, abonamente, facturi." | condițiile 1 și 7 (chei Stripe live, rambursare cu alarmă, reconciliere) |
| „E-mail de verificare și de resetare livrat." | condiția 2 (`SMTP_URL` reală) — altfel e-mailurile ajung **pe disc**, nu la utilizator (`00-BRIEFING.md` §5.2) |
| „Copii de rezervă în afara hostului." | condiția 3 (`OFFSITE_TARGET` + cheie + drill de restaurare) |
| „Containere care chiar rulează." | condiția 4 — azi panoul raportează `state = None` pe toate cele 5 servere |
| „Catalog complet." | condiția 5 (prețurile celor 4 produse fără egg ascunse; `feature_limits` realiste) |
| „Provisionare fiabilă." | condiția 6 (20 de rulări consecutive reușite, serverele orfane șterse, poarta de disc corectată) |
| „Domenii de client rutate." | `CADDY_ADMIN_URL` + `CADDY_ADMIN_TOKEN` + bloc `admin` în Caddyfile (`00-current-state.md` §3.4) |

---

## 8. Diferențiatori reali — ce poate fi susținut acum

| diferențiator | dovadă | clasa lui |
|---|---|---|
| **Preț determinist server-side.** Clientul nu poate construi o configurație care costă mai mult decât cota afișată. | `api/src/services/pricing.ts:39-53`; 255/255 cote live identice cu formula; `05-pricing-consistency.md` §9.1: **0 inconsistențe** între cele șase prețuri | `VERIFIED` |
| **Eticheta „Starting price" e corectă peste tot.** Nicio suprafață nu prezintă 149 ca preț al configurației implicite. | `05-pricing-consistency.md` §6, 11 suprafețe verificate | `CODE-INSPECTED` |
| **Upgrade-ul de resurse e o comandă cu plată, nu o mutare de câmp.** | `api/src/routes/instances.ts:268-301` — cu `priceDelta > 0` se creează o comandă `AWAITING_PAYMENT` și instanța **nu** e atinsă; poarta 4 = 🟢 GREEN | `CODE-INSPECTED` + `VERIFIED` |
| **Izolarea între clienți e dovedită în ambele sensuri.** | `api/tests/isolation.test.ts` (9 teste); live: instanța altui client → 404, comanda altui client → 404, rută de staff → 403 | `VERIFIED` |
| **Fiecare client primește chei proprii, nu o cheie globală.** | 3 rânduri `PanelCredential` cu `source='bridge'`; cheia globală `PTERODACTYL_CLIENT_KEY` e goală | `VERIFIED` |
| **Instrumentare de produs reală: `AuditLog` cu 528 rânduri, 22 permisiuni granulare pe staff, 240 de teste automate.** | `00-current-state.md` §3.9; `07-release-gates.md` §4.2 | `VERIFIED` |
| **Design coerent și accesibil: WCAG 2.2 AA ca țintă, 553 de verificări de browser verzi.** | `00-BRIEFING.md` §8; `07-release-gates.md` §4.2 | `VERIFIED` |

**Diferențiatori care NU pot fi susținuți:** uptime, SLA, număr de clienți, recenzii, „24/7", „instant deploy", acoperire cu jocuri, prețuri mai mici decât ale pieței, „cel mai simplu mod de a găzdi un joc".

---

## 9. Riscurile de poziționare și cum se tratează

| risc | unde se vede | tratament propus |
|---|---|---|
| **Promisiunea de brand depășește catalogul.** „run any app" vs. 1 produs real | `docs/BLIPMADE_DESIGN_PROMPT.md:9` vs. catalog live | restrângi mesajul public la S1 până când `wordpress`, `postgresql`, `uptime-kuma`, `code-server` au egg + imagine + comandă de pornire |
| **Story-ul de marketing listează 7 aplicații inexistente** („Ghost", „n8n", „Forgejo"…), fără disclaimer | `web/src/home/Story.tsx:8,25`; `web/src/home/Ticker.tsx:4`; `web/src/data.ts:19-30` (12 intrări); `05-pricing-consistency.md` §6 L2 | fie se șterg, fie se etichetează „illustrative" pe fiecare suprafață publică; altfel e o reclamație de publicitate |
| **Prețurile afișate pe scenă sunt ilustrative și diferite de cele reale** („WordPress · 1 GB → €2.09", „PostgreSQL · 1 GB · 5 GB → €4.49") | `web/src/home/Platform.tsx:88` | etichetare „illustrative" sau înlocuire cu valorile live |
| **Blocul „Founding users offer" promite o reducere care rupe checkout-ul** | `web/src/home/Catalog.tsx:202-213`; `05-promotions.md` §9 | textul mic de sub el („no campaign is running yet") e corect, dar blocul mare trebuie scos sau marcat „not running" până la repararea B1 |
| **Planul anual apare în reflexie în copy-ul de reducere**, deși nu există | `09-pricing-recommendations.md` §4: „PROPUNERE, nu capabilitate" | niciun menționare de „annual" în copy până când `YEARLY` nu e implementat și `renew()` nu mai fabrică facturi plătite (B4) |
| **Prețul curent e sub pragul de cost** — fiecare client adăugat mărește pierderea | `09-unit-economics.md` §12 | nu se lansează cu cardul actual; se adoptă **€9.99** (`09-pricing-recommendations.md` §2.2) sau cardul de rezervă `baseAmount = 599` (§2.4) |
| **„Suport prin tichet" fără echipă de suport** | 2 membri de staff în DB (`00-current-state.md` §3.9); 12 tichete, toate `OPEN` | publicare explicită a ferestrei de răspuns înainte de lansare sau reducerea promisiunii la „tichete, citite de un operator" |

---

## 10. Rezumat

| întrebare | răspuns |
|---|---|
| **Categorie** | **două categorii, în funcție de rută**: managed application hosting (PaaS) — ruta `09-*`/`16-`, produs `discord-bot`; game hosting (Minecraft RO) — ruta `08-*`, produs `minecraft-paper`. **Niciodată „VPS"** |
| **Promisiune de bază (azi)** | „one small thing running all the time", concret: un bot Discord — singurul produs deployabil |
| **Promisiune de extindere (după poartă)** | „the apps and databases you actually use, in one dashboard" — sau, pe ruta `08-*`, „a Minecraft server that stays on when your laptop shuts down" |
| **Segment prioritar** | **S1** — autori de bot Discord (singurul produs deployabil, singurul cu contribuție pozitivă la prețul recomandat) |
| **Segment amânat** | **S3** — game hosting: **cel mai bine documentat** (3 concurenți RO cu prețuri publice, plus Aternos gratuit), dar blocat de **backup inexistent + DDoS inexistent + produs inexistent** — nu de port |
| **Segment decompensat** | **S2** — auto-găzduire WordPress/DB: `08-product-portfolio.md` §10 le dă `DO-NOT-OFFER-ON-THIS-HARDWARE` — **nu doar „amânate", ci „nu oferite pe acest hardware"** |
| **Alternative evidențiabile** | **A1** (VPS configurat de tine), **A2** (Pterodactyl auto-găzduit — și panoul concurentului Zentaris), **A3** (cloud generic) + **concurenți numiți cu preț** (Aternos €0, OVINETWORK €3.99, Zentaris €4.49, Torchbyte €4.74 — `DOCUMENTED-ONLY`, din `08-competitive-analysis.md` §2–§3) |
| **Prețul de poziționare** | **€9.99/lună** la 512 MB / 1 vCPU / 5 GB (`baseAmount = 976`) — aliniat cu `audit/09-pricing-recommendations.md` §2.2 și `audit/16-GO-NO-GO-DECISION.md` §5; **nu contrazic aceste fișiere**. Alternativa `08-*` (€4.09–€5.99 pentru `minecraft-paper`) e înregistrată în §3.1, cu modelul de cost incompatibil explicat |
| **Cea mai bună diferențiatorie azi** | preț determinist server-side + upgrade cu plată + izolare dovedită — toate trei `VERIFIED` |
| **Cea mai mare amenințare** | lansarea cu promisiunea de brand („any app") și cu cardul de preț sub pragul de cost |

> **Notă de conformitate:** acest document nu conține cote de piață, recenzii, volume de căutare sau uptime **verificat**. Conține, în schimb, **prețuri de concurență**, preluate din `audit/08-competitive-analysis.md` §2–§3, unde au fost citite din surse live pe 2026-10-23; pentru acestea clasă mea este `DOCUMENTED-ONLY`, fiindcă **eu nu le-am re-citit**. Nu se publică niciun număr de utilizatori în afara celor măsurate în sistem (`6` utilizatori, `0` abonamente, `0` plăți) și nicio recenzie, pentru că nu există. Orice afirmație de tip „nu există competitor pe piață" ar fi o invenție.
