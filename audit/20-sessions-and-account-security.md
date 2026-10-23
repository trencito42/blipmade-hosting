# 20 — Sesiuni și securitatea contului

Revizie de a doua rundă, auditor A22. Secțiunea 5 a brief-ului (sesiuni și securitatea contului) și secțiunea
informațiilor de sesiune din pagina de Setări.

## Metodă

**Codul citit.** Arborele de lucru `/root/blipmade-work`, citit la **23 octombrie 2026, 20:54 UTC** (instantane
copiat în `/tmp/snap` înainte de scriere, ca numerele de linie să fie verificabile). Atenție: în timpul acestei
revizii arborele de lucru a fost modificat de un alt flux de lucru, și **diferă de buildul live** `3948f7f` aflat pe
VM-ul `/opt/blipmade` (17 fișiere: `api/src/plugins/auth.ts`, `api/src/routes/settings.ts`, `api/src/routes/catalog.ts`,
`api/src/services/availability.ts`, `web/src/app/{Settings,Billing,Domains,DeployCatalog,ProductPage}.tsx`,
`web/src/home/Catalog.tsx`, `web/src/admin/Products.tsx`, `web/src/lib/{api,pricing-contract}.ts`). Fiecare constatare
spune explicit în ce stare este: **„arborele de lucru"** (codul citit acum) sau **„buildul live 3948f7f"** (codul
care rulează în producție și în stiva izolată, în care s-au făcut toate măsurătorile de runtime).

**Runtime.** Stiva izolată `http://10.77.0.13:30003` (copie în `/tmp` pe VM 103, baza `blipmade_test`, contul
`qa.check@example.test`), Chromium prin `playwright-core` pe VM 103. S-au folosit două contexte de browser cu
user-agent-uri diferite (Safari pe iOS și Chrome pe iOS) ca să se reproducă exact simptomul raportat.

**Producție — strict citire.** `docker compose exec postgres psql -c "SELECT …"` pe baza `blipmade`. S-au raportat
doar agregate: număr de sesiuni pe cont, număr de adrese distincte, număr de browsere distincte, diferențe de timp
între creări. **Nu a fost copiat, afișat sau notat niciun token, niciun cookie, nicio parolă.** Adresa de e-mail a contului real folosit drept exemplu a fost redată în acest raport (`client@exemplu.ro`); în baza de producție ea există, dar nu se repetă aici. În baza de producție
există un rând `Session.tokenHash` (SHA-256) și un cookie `bm_session`; am citit doar agregate peste `ip`,
`userAgent`, `createdAt`, `expiresAt` și am folosit identificatori de rând trunchiați la 8 caractere.

**Nu s-a autentificat niciodată pe `https://blipmade.com`.** Pentru stabilirea adresei clientului s-a folosit
doar `GET /api/health` (cerere publică, fără efect pe date) și log-ul containerului API.

**Limita de rată a fost atinsă o dată** în stiva izolată (10 încercări de autentificare / 15 min pe adresă, contor
în memorie în procesul API) — limită verificată ca funcțională, nu forțată.

**Documente citite înainte:** `audit/00-BRIEFING.md`, `audit/02-security-audit.md` (grupul `SEC-*`),
`audit/06-design-system.md`, `audit/06-ux-ui-complete.md`, `audit/12-FULL-FINDINGS-REGISTER.md` (grupele `SEC-*`,
`UX-*`). Constatările deja existente sunt **referențate, nu repetate**: `SEC-05` (lista de proxy-uri),
`SEC-07` (limitarea autentificării doar per adresă).

## Rezumat

| ID | Unde | Simptom | Severitate | Clasă | Unde este dovedit |
|---|---|---|---|---|---|
| **SESS-01** | Setări → sesiuni; tot jurnalul de audit | Adresa de client înregistrată în `Session.ip` și în jurnal este adresa **proxy-ului**, nu a clientului | **High** | `VERIFIED` | agregate DB producție + log API live + `web/server.mjs:87-96` |
| **SESS-02** | `POST /api/auth/login` | Limita de 10 încercări / 15 min este cheiată pe **adresa edge-ului Cloudflare**, nu pe adresa clientului | **High** | `VERIFIED` | `api/src/app.ts:67` + `request.ip` observat în log |
| **SESS-03** | Setări → sesiuni | Orice browser de pe iOS era afișat ca „Safari on iOS" (Chrome, Edge, Firefox pe iOS) | Medium | `VERIFIED` pe buildul live / **corectat în arborele de lucru** | `api/src/routes/settings.ts:124-149` (live: 120-143) + randare live |
| **SESS-04** | Setări → sesiuni | Niciun câmp al listei nu deosebește două sesiuni ale aceluiași dispozitiv: rândurile sunt identice | Medium | `VERIFIED` | randare live + agregate DB producție |
| **SESS-05** | `createSession` | Fiecare autentificare creează o sesiune nouă; cele vechi rămân **valide 14 zile** și nu se reiau | Medium | `VERIFIED` | `api/src/plugins/auth.ts:66-106` + agregate DB producție |
| **SESS-06** | Setări → sesiuni | Lista se numește „dispozitive" și arată sesiuni; nu există „închide celelalte sesiuni" și nu se vede ultima activitate | Low | `CODE-INSPECTED` | `web/src/app/Settings.tsx:475-503` |
| **SESS-07** | Produs | **Nu există al doilea factor**: nu există categorie de sesiuni „în așteptarea confirmării MFA" | Info | `NOT-IMPLEMENTED` | căutare în `api/src` și `web/src` |
| **SESS-08** | `TRUSTED_PROXIES` | API-ul are încredere în **tot** `172.16.0.0/12` — `SEC-05` încă prezent | Medium | `CODE-INSPECTED` | `api/src/env.ts:95` + `.env` pe VM |

**Constatări deja existente, reconfirmate (nu se repetă):** `SEC-05` — încă prezent, fără `TRUSTED_PROXIES` în `.env`
de producție; default-ul este `127.0.0.1,::1,172.16.0.0/12` (vezi SESS-08). `SEC-07` — autentificarea rămâne
limitată doar per adresă, fără limită per cont (vezi SESS-02 pentru partea care mai era necunoscută: adresa folosită
ca cheie nu este a clientului).

---

## SESS-01 — Adresa clientului nu este înregistrată nicăieri: se înregistrează adresa proxy-ului

**Simptom observat.** Lista de sesiuni arată, lângă fiecare sesiune, o adresă care nu aparține clientului. În
producție, 241 dintre cele 269 de sesiuni vii au o adresă din range-urile edge-ului Cloudflare
(`172.64.x.x`, `162.158.x.x`, `172.69.x.x`). Pentru contul real `client@exemplu.ro`, 13 dintre cele 22 de sesiuni au
adresa `10.77.0.12` — care este **adresa gateway-ului TLS de pe VM 102**, nu a clientului.

**Cauză confirmată.** `web/server.mjs:87-96`:

```
function clientAddress(req) {
  const peer = normalizeAddress(req.socket.remoteAddress);
  if (!isTrustedProxy(peer)) return peer;
  const forwarded = req.headers['x-forwarded-for'];
  const chain = ... split(',') ...
  return chain.length ? chain[chain.length - 1] : peer;   // ← ultimul element
}
```

Lanțul `X-Forwarded-For` se citește de la dreapta: prin convenție, **primul** element este clientul original, iar
**ultimul** este proxy-ul cel mai apropiat. Codul alege ultimul element, deci alege proxy-ul. Valoarea aleasă este
apoi scrisă în headerul `x-forwarded-for` pe care serverul web îl trimite către API (`web/server.mjs:138` și
`:238`), iar API-ul calculează `request.ip` cu `trustProxy` (`api/src/app.ts:47`).

Înainte de web, **gateway-ul pierde deja adresa reală**: `/etc/caddy/Caddyfile` pe VM 102 este
`reverse_proxy 10.77.0.13:3000`, fără `trusted_proxies`, deci Caddy **înlocuiește** `X-Forwarded-For` cu adresa
peer-ului său (edge-ul Cloudflare) și renunță la valoarea de încredere pe care Cloudflare o trimite. Planul de rețea
al proiectului își spune deja asta și propune `trusted_proxies` pentru range-urile Cloudflare
(`audit/03-network-and-ip-plan.md` §4.4) — propunerea **nu este aplicată** pe VM 102.

**Severitate: High. Clasă: `VERIFIED`.**

**Dovezi.**
1. *Producție, baza de date (citire):* 269 de sesiuni, 6 conturi, 0 sesiuni expirate rămase. Distribuția
   adreselor: 34 sesiuni la `172.64.200.138`, 28 la `162.158.172.151`, 24 la `172.64.198.64`, 24 la
   `172.64.198.65`, 21 la `162.158.103.151`, 18 la `172.64.200.139`, 15 la `172.69.155.34`, 12 la
   `172.69.155.35`, 9 la `162.158.172.150`, 2 la `162.158.103.152`, 1 la `162.158.103.153`, 1 la `162.158.14.14` —
   toate adrese Cloudflare; 30 la `172.18.0.1` (gateway-ul docker), 13 la `172.18.0.6`, 13 la `10.77.0.12`
   (gateway-ul TLS), 13 la `10.77.0.13`, 2 la `127.0.0.1`.
2. *Runtime, producție, fără autentificare:* `GET https://blipmade.com/api/health` → log-ul containerului API:
   `"req":{"method":"GET","url":"/api/health","host":"api:3100","remoteAddress":"172.69.155.34"}`, în timp ce
   adresa reală a apelantului era `193.34.214.20`. `remoteAddress` este `request.ip` (serializatorul standard
   Fastify), deci **acesta este exact cheia folosită la limitarea de rată**.
3. *Runtime, gateway direct:* `curl --resolve blipmade.com:443:10.77.0.12 -H 'X-Forwarded-For: 203.0.113.9,
   198.51.100.7' https://blipmade.com/api/health` → `remoteAddress: 10.77.0.1` (peer-ul real), **nu** valorile
   trimise. Gateway-ul a înlocuit headerul.
4. *Runtime, falsificare prin Cloudflare:* `curl -H 'X-Forwarded-For: 203.0.113.9' https://blipmade.com/api/health`
   → `remoteAddress: 162.158.172.150` — adresa falsificată **nu** a ajuns la API, dar nici adresa reală nu.

**Impact.**
- Clientul nu poate recunoaște o sesiune ca fiind a lui: adresa afișată e comună tuturor celor care trec prin
  același punct Cloudflare și se schimbă între cereri (SESS-04).
- Jurnalul de audit (`audit()` primește `ip: request.ip` în `api/src/routes/auth.ts:184`, `:178`,
  `api/src/routes/settings.ts:391`, `:430`) nu mai permite nicio urmărire a unui atac venit de la o adresă anume.
- Limita de rată a autentificării ajunge să fie cheiată pe o adresă comună (SESS-02).
- Nu se poate răspunde la întrebarea pe care o pune un client: „de unde sunt semnat?" — răspunsul afișat este fals.

**Corectare recomandată (trei fișiere, fără cod scris).**
1. `web/server.mjs:95` — se ia **primul** element al lanțului (`chain[0]`), adică clientul original, nu ultimul.
   Pentru lanțuri cu mai multe salturi, se ia primul element care nu este în lista de proxy-uri de încredere
   (`TRUSTED_PROXY_IPS`); dacă toate elementele sunt de încredere, se cade pe `peer`.
2. `/etc/caddy/Caddyfile` pe VM 102 — se adaugă `servers { trusted_proxies static <range-urile Cloudflare> }`, ca
   valoarea de încredere trimisă de Cloudflare să nu fie înlocuită. Este exact propunerea din
   `audit/03-network-and-ip-plan.md` §4.4; fără acest pas, corectarea de la punctul 1 tot nu ajunge la client.
3. `api/src/env.ts:95` + `.env` de producție — `TRUSTED_PROXIES` se setează explicit pe adresa containerului
   `web` (și a gateway-ului), nu implicit pe `172.16.0.0/12` (vezi SESS-08).

---

## SESS-02 — Limita de rată a autentificării este cheiată pe adresa proxy-ului

**Simptom observat.** Limita de 10 încercări de autentificare la 15 minute se aplică, în producție, unui grup de
adrese care nu aparțin clientului. Doi oameni diferiți care ies prin același punct Cloudflare împart același
contor; un atacator care împarte cererile între mai multe edge-uri nu este limitat deloc.

**Cauză confirmată.** `api/src/app.ts:67`:

```
keyGenerator: (request) => (env.isTest ? `${request.ip}:${rateLimitRun()}` : request.ip),
```

Cheia este `request.ip`. Prin SESS-01, `request.ip` este adresa edge-ului Cloudflare, nu adresa clientului. În
mediul de test cheia mai conține un număr de rulare (`:0`), ceea ce face contorul stabil pentru o adresă — exact
ce se observă în stiva izolată.

**Severitate: High. Clasă: `VERIFIED`.**

**Dovezi.**
- Cod: `api/src/app.ts:67` (cheia = `request.ip`) + `api/src/app.ts:47` (`trustProxy`).
- Runtime: `request.ip` pentru o cerere publică = `172.69.155.34` / `162.158.172.150` / `104.22.104.72` — trei
  adrese Cloudflare diferite pentru trei cereri consecutive ale aceluși client (doar PoP-ul diferă).
- Runtime, stiva izolată: după 10 autentificări consecutive cu contul `qa.check@example.test`,
  `POST /api/auth/login` a răspuns `429 {"error":{"code":"rate_limited","message":"Too many requests. Try again
  shortly."}}` — limita funcționează, dar pentru adresa **mașinii**, nu pentru cont.
- `SEC-07` (existent): nu există limită per cont. Nu se repetă aici; SESS-02 adaugă doar faptul că nici limita
  per adresă nu este cea anunțată.

**Impact.** Un client legitim poate fi blocat de ceilalți vizitatori ai aceluși punct Cloudflare; un atacator cu
cereri distribuite între edge-uri evită complet limita. Pe lângă limită, și **jurnalul** autentificărilor eșuate
(`action: 'auth.login_failed'`, `ip: request.ip`, `api/src/routes/auth.ts:178`) înregistrează adrese proxy, deci
nici măcar nu se poate vedea de unde vin tentativele.

**Corectare recomandată.**
1. **Mai întâi SESS-01**: cu adresa reală a clientului, cheia devine corectă fără altă modificare.
2. `api/src/routes/auth.ts:167` (și `:228`, `:245`, `:263`) — se adaugă o a doua limită, cu cheia contului
   (`body.email` normalizat), independentă de adresă, pentru ca un cont să nu poată fi ghicit de la orice adresă.
3. `api/src/app.ts:67` — cheia limitelor să folosească aceeași funcție unică de rezolvare a adresei clientului
   (după SESS-01), nu `request.ip` al lui Fastify.

---

## SESS-03 — Orice browser de pe iOS era afișat ca „Safari on iOS"

**Simptom observat.** Pe iOS, toate browserele folosesc motorul WebKit și trimit „Safari" în user-agent. Lista de
sesiuni arăta „Safari on iOS" pentru Chrome, Edge și Firefox de pe iPhone, la fel ca pentru Safari.

**Cauză confirmată (buildul live `3948f7f`).** `api/src/routes/settings.ts:120-143` — lista de browsere era
`Edg/`, `OPR/`, `Chrome/`, `Firefox/`, `Safari/`. Variantele de pe iOS sunt `CriOS/`, `EdgiOS/`, `FxiOS/`,
`OPiOS/`: niciuna nu se potrivește, deci toate cad pe `Safari/`. Numele browserului precedă numele motorului,
deci rezultatul a fost „Safari on iOS" pentru patru browsere diferite.

**Severitate: Medium. Clasă: `VERIFIED` pe buildul live; corectat în arborele de lucru.**

**Dovezi.**
- *Runtime, stiva izolată:* o autentificare cu user-agent-ul Chrome pe iOS
  (`… CriOS/130.0.0.0 Mobile/15E148 Safari/604.1`) a produs un rând în lista de sesiuni etichetat
  **„Safari on iOS"**, identic cu rândul autentificării cu Safari.
- *Build live:* `api/src/routes/settings.ts:120-143` (numele browserului listat mai sus).
- *Arborele de lucru:* `api/src/routes/settings.ts:124-149` — expresiile au fost extinse la
  `/Edg(?:iOS|A)?\//`, `/OPR(?:iOS)?\//`, `/(?:CriOS|Chrome)\//`, `/(?:FxiOS|Firefox)\//`. **`OPiOS` (Opera pe iOS)
  nu este acoperit nici acum** și va continua să fie afișat ca „Safari on iOS".

**Impact.** Auditul de cont al clientului („sunt semnat pe telefonul meu pierdut?") nu poate fi făcut: patru
browserere diferite sunt indistinctibile. Contribuie direct la SESS-04.

**Corectare recomandată.**
1. `api/src/routes/settings.ts:124-149` — se adaugă `OPiOS` în lista de browsere; se curăță expresiile redundante
   (`/(?:CriOS|Chrome)\/|CriOS/` → `/(?:CriOS|Chrome)\//`).
2. `api/src/routes/settings.ts:137-147` — se adaugă în eticheta dispozitivului **versiunea sistemului** și
   **modelul** din user-agent (ex. „iOS 18.7"), pentru ca două iPhone-uri diferite să nu arate la fel.
3. Recomandare de fond: numele dispozitivului să vină din client (`Sec-CH-UA-Model`, trimis de browser și
   rezolvat în API), cu user-agent-ul ca rezervă — valoarea din header poate fi verificată contra
   user-agent-ului, dar nu contra ei însele.

---

## SESS-04 — Lista de sesiuni nu poate deosebi două sesiuni ale aceluiași dispozitiv

**Simptom observat.** Pe pagina de Setări, mai multe rânduri au **exact aceleași metadate vizibile**. Pe stiva
izolată, trei rânduri consecutive s-au randat astfel:

```
Safari on iOS | 10.77.0.13 · signed in on 23 Oct 2026 | Close session
Safari on iOS | 10.77.0.13 · signed in on 23 Oct 2026 | Close session
Safari on iOS | This device | 10.77.0.13 · signed in on 23 Oct 2026 | Sign out
```

În producție, contul `client@exemplu.ro` are **5 sesiuni distincte create pe 23 octombrie, la 02:10:35, 03:48:18,
04:19:59, 04:20:30 și 04:34:00**, toate cu același user-agent (Safari pe iPhone, iOS 18.7) și toate cu adresa
`10.77.0.12`.

**Cauză confirmată.** Sunt patru cauze care se compun, fiecare în cod:
1. **Adresa afișată nu este a clientului** → SESS-01 (`web/src/app/Settings.tsx:492` afișează `session.ip`).
2. **Numele dispozitivului** depinde doar de user-agent → SESS-03 (`api/src/routes/settings.ts:124-149`).
3. **Data fără oră**: lista afișa `fmtDate` (doar ziua) → în arborele de lucru s-a trecut la `fmtDateTime`
   (`web/src/app/Settings.tsx:78`, folosit la `:492`), deci rândurile nu mai sunt identice *ca text*; diferența
   este însă de ordinul minutelor.
4. **Nu există „ultima activitate"**: modelul `Session` (`api/prisma/schema.prisma:153-165`) nu are o coloană
   `lastSeenAt`, iar `loadSession` (`api/src/plugins/auth.ts:123-141`) nu actualizează nimic la folosirea unei
   sesiuni. Singurele informații despre o sesiune sunt: dispozitivul, adresa proxy-ului, momentul creării.
5. **Lista nu filtrează sesiunile expirate** (`api/src/routes/settings.ts:172` și `:410`, `take: 50`, fără
   filtru pe `expiresAt`) — o sesiune deja moartă poate apărea în listă până la curățarea orară.

**Severitate: Medium. Clasă: `VERIFIED`.**

**Dovezi.**
- Randare live în stiva izolată (textul de mai sus), obținut cu `page.evaluate` pe elementele `li` ale listei.
- Agregate producție: contul `client@exemplu.ro` — 22 de sesiuni, 4 user-agent-uri, 2 adrese; dintre acestea, 5 cu
  exact același user-agent și aceeași adresă, toate pe aceeași zi. Contul `qa.headless.one@example.test` — 182 de
  sesiuni.
- Model: `api/prisma/schema.prisma:153-165` — `Session` are doar `tokenHash`, `userId`, `expiresAt`, `ip`,
  `userAgent`, `createdAt`. Nu există `lastSeenAt` și nu există niciun index pe `(userId, createdAt)`.
- Cod: `api/src/routes/settings.ts:172` (lista din `GET /settings`), `:410` (lista din `GET /settings/sessions`).

**Impact.** Funcția pe care lista ar trebui să o aibă — „unde sunt semnat și ce pot închide" — nu poate fi
îndeplinită. Când un client pierde un telefon, rândurile pe care le vede nu îi spun care este telefonul pierdut;
poate închide rândul greșit (al telefonului lui curent) și poate lăsa deschisă sesiunea pierdută. Identificarea
sesiunii curente este corectă la nivel de API (SESS-04 nu contestă asta), dar **nu poate fi citită din
interfață**: singurul semn este insigna „This device".

**Corectare recomandată.**
1. `api/prisma/schema.prisma:153-165` — se adaugă coloana `lastSeenAt DateTime?` pe `Session` (o migrare nouă).
2. `api/src/plugins/auth.ts:123-141` (`loadSession`) — se actualizează `lastSeenAt` cu o frecvență amortizată
   (de exemplu o dată la 5 minute, ca nu se scrie pe fiecare cerere).
3. `web/src/app/Settings.tsx:488-493` — rândul afișează „ultima activitate" (relativ: „acum 12 minute") în locul
   sau alături de momentul creării; textul devine „dispozitiv · ultima activitate · adresă".
4. `api/src/routes/settings.ts:172` și `:410` — se filtrează `expiresAt: { gt: new Date() }`, ca lista să nu arate
   sesiuni deja moarte.
5. `api/src/routes/settings.ts:124-149` — împreună cu SESS-03, modelul și versiunea sistemului.

---

## SESS-05 — Fiecare autentificare creează o sesiune nouă; cele vechi rămân valide 14 zile

**Simptom observat.** Un cont acumulă sesiuni. În producție: 269 de sesiuni pe 6 conturi, dintre care **226 au
fost create în mai puțin de 10 minute față de sesiunea precedentă a aceluiași cont**, iar 198 în mai puțin de 2
minute. Contul `qa.headless.one@example.test` are 182 de sesiuni, `client@exemplu.ro` are 22, `admin@blipmade.com`
are 20.

**Cauză confirmată.** `api/src/plugins/auth.ts:66-106` (`createSession`):
- **Nu se reutilizează** o sesiune existentă: fiecare autentificare (`api/src/routes/auth.ts:183`, plus
  `:154` la înregistrare și `:330` la `enroll-admin`) inserează un rând nou, cu un token nou.
- **Nu se reînnoiește** termenul: `expiresAt = createdAt + SESSION_TTL_MS` (`api/src/plugins/auth.ts:11` și
  `:72`), termen **absolut**, fără glisare. Verificat în baza de producție: `expiresAt - createdAt` = exact
  14 zile pentru fiecare rând.
- **Sesiunile vechi nu se închid** la o autentificare nouă. Singura închidere în masă este la schimbarea
  parolei (`api/src/routes/settings.ts:388-389`).
- *Arborele de lucru* adaugă o plafă: `MAX_SESSIONS_PER_USER = 20` (`api/src/plugins/auth.ts:63`) și șterge
  cele mai vechi sesiuni peste plafă (`:84-95`). **Plafa este aplicată doar la creare** și **nu ține cont de
  faptul că o sesiune poate fi cea curentă**; când plafa este atinsă, sesiunea cea mai veche este închisă
  **fără niciun mesaj pentru client și fără o intrare în jurnal**.

**Severitate: Medium. Clasă: `VERIFIED`.**

**Dovezi.**
- Cod: `api/src/plugins/auth.ts:66-106`, `:11`; `api/src/routes/auth.ts:183`.
- Agregate producție (citire): 269 de sesiuni / 6 conturi; 226 create la mai puțin de 10 minute după sesiunea
  precedentă a aceluiași cont; 198 la mai puțin de 2 minute. Distribuția pe cont: 182 / 29 / 22 / 20 / 15 / 1.
- Baza de producție: `expiresAt − createdAt` = „13 days 23:59:59.999" pentru toate cele 5 sesiuni iPhone ale
  contului `client@exemplu.ro` — termen absolut, fără reînnoire.
- *Arborele de lucru:* `api/src/plugins/auth.ts:55-63` (constanta) și `:84-95` (ștergerea celor vechi).

**Impact.** Fiecare autentificare lasă în urmă o sesiune validă, cu un cookie valid, timp de 14 zile — inclusiv
sesiunile „zombi" (o autentificare nouă în același browser suprascrie cookie-ul, iar rândul vechi rămâne viu, cu
un token pe care nimeni nu îl mai are; nu poate fi recunoscut ca zombi în listă). Plafa de 20 limitează
creșterea, dar nu rezolvă zombi și nu spune clientului ce s-a închis.

**Corectare recomandată.**
1. `api/src/plugins/auth.ts:66-106` — la autentificare, dacă cererea poartă deja un cookie de sesiune valid al
   aceluiași cont, sesiunea aceea se **rotunjeste** (token nou, `expiresAt` prelungit) în loc de a se insera una
   nouă. Rotunjirea trebuie făcută **după token, nu după adresă sau user-agent** — două sesiuni legitime pot
   avea aceeași adresă și același browser.
2. `api/src/plugins/auth.ts:84-95` — ștergerea din plafă să scrie o intrare în jurnal (`settings.session_revoked`,
   cu motivul „plafă") și să nu poată închide sesiunea curentă a cererii.
3. `api/src/routes/settings.ts` — o acțiune „închide celelalte sesiuni" (un `DELETE /settings/sessions` fără id)
   ca alternativa la închiderea sesiune cu sesiune; lista nu poate fi folosită la asta (SESS-04).

---

## SESS-06 — Textul listei promite dispozitive și livrează sesiuni; nu se vede ultima activitate

**Simptom observat.** Panoul se numește „Sessions", iar descrierea spune „The devices that are signed in to this
account." — dar ceea ce se afișează sunt **sesiuni**, nu dispozitive: același telefon (vezi SESS-04) apare de
mai multe ori. Butonul rândului curent este „Sign out", iar al celorlalte „Close session": diferența de etichetă
este singurul semn care separă două rânduri, și este unul care acționează asupra obiectului (semnul de ieșire
închide sesiunea curentă și deconectează clientul).

**Cauză confirmată.** `web/src/app/Settings.tsx:475` (descrierea panoului), `:488` (insigna „This device"),
`:500` (etichetele butoanelor), `:462-472` (`onRevoke` folosește **steaua din listă**, `session.current`, nu
răspunsul serverului, deși serverul îl trimite: `api/src/routes/settings.ts:439` → `{ revoked, current }`).

**Severitate: Low. Clasă: `CODE-INSPECTED`.**

**Dovezi.**
- Cod: `web/src/app/Settings.tsx:475`, `:488`, `:496-501`, `:462-472`; `api/src/routes/settings.ts:421-439`.
- Cod: `api/src/routes/settings.ts:405-412` — lista din `GET /settings/sessions` și cea din `GET /settings`
  (`:172`) returnează amândouă aceleași 50 de rânduri, fără filtru pe expirare și fără `lastSeenAt`.

**Impact.** Clientul citește „dispozitive" și înțelege „dispozitive"; când trebuie să închidă o sesiune, eticheta
„Sign out" de pe rândul curent este ușor de ratat printre rânduri identice, iar închiderea rândului curent îl
deconectează. Nu există niciun mesaj care să spună că „s-au închis și celelalte sesiuni" în cazul plafei de 20.

**Corectare recomandată.**
1. `web/src/app/Settings.tsx:475` — descrierea devine „The sessions that are open for this account." (sau lista
   devine, într-adevăr, pe dispozitive).
2. `web/src/app/Settings.tsx:495-501` — `onRevoke` folosește `result.current` (răspunsul serverului) în loc de
   steaua din listă; butonul rândului curent rămâne „Sign out", iar celelalte „Close session", dar textul
   rândului curent spune explicit „the device you are on".
3. `api/src/routes/settings.ts` — răspunsul la schimbarea parolei și la plafă se comunică în interfață prin
   `useToast` (numărul de sesiuni închise), nu doar în răspunsul JSON.

---

## SESS-07 — Nu există al doilea factor; deci nu există sesiuni „în așteptarea confirmării MFA"

**Simptom observat / constatare.** Brief-ul cere verificarea vizibilității sesiunilor care așteaptă confirmarea
MFA. **Platforma nu are niciun al doilea factor.** Căutarea în `api/src` și `web/src` pentru `totp`, `mfa`,
`two-factor`, `2fa`, `authenticator` nu întoarce nicio implementare; singurele apariții sunt în documentație
(`docs/BLIPMADE_DESIGN_PROMPT.md`), ca cerință de proiect, nu ca funcție.

**Cauză confirmată.** `api/src/routes/auth.ts:183` — sesiunea este creată și este complet utilizabilă în aceeași
clipă cu răspunsul de autentificare; nu există nicio stare intermediară. Singurul obiect „în așteptare" din
răspunsul paginii de Setări este `pendingEmail` — o cerere de schimbare a adresei de e-mail
(`api/src/routes/settings.ts:196`), nu o sesiune.

**Severitate: Info. Clasă: `NOT-IMPLEMENTED`.**

**Dovezi.** Căutare textuală fără rezultat în `api/src/**` și `web/src/**`; `api/src/routes/settings.ts:168-176`
(`pendingEmail` = `emailChangeRequest`); `api/src/routes/auth.ts:183`.

**Impact.** Nu există o categorie de sesiuni „în așteptare" care să fie ascunsă sau vizibilă — și nu există
niciun mecanism de a confirma o autentificare cu un al doilea factor. Parola și limita de rată sunt singurele
bariere (vezi SESS-02); `SEC-07` (fără limită per cont) rămâne deschis.

**Corectare recomandată (dacă MFA intră în plan).**
1. `api/prisma/schema.prisma` — un model `MfaChallenge` (cont, cod, expirare, consum) și o coloană
   `pendingMfa` pe `Session`, ca o sesiune să poată exista înainte de confirmare.
2. `api/src/routes/auth.ts:166-188` — la autentificare, dacă contul are un factor secundar, sesiunea se creează
   **marcată ca neconfirmată** și nu dă acces până la confirmare; lista de sesiuni arată explicit starea.
3. `web/src/app/Settings.tsx` — panoul de sesiuni arată separat „sesiuni în așteptare" (neprecizate de client).

---

## SESS-08 — API-ul are încredere în întregul `172.16.0.0/12` (confirmare `SEC-05`)

**Simptom observat.** `TRUSTED_PROXIES` nu este setat în `.env` de producție; valoarea implicită este
`127.0.0.1,::1,172.16.0.0/12`.

**Cauză confirmată.** `api/src/env.ts:95` (implicitul) și `api/src/env.ts:146` (citirea valorii);
`api/src/app.ts:47` (`trustProxy: env.trustProxies`).

**Severitate: Medium. Clasă: `CODE-INSPECTED`. `SEC-05` este încă prezent.**

**Dovezi.**
- `grep '^TRUSTED' /opt/blipmade/.env` pe VM 103 → doar `TRUSTED_PROXY_IPS=10.77.0.12` (variabila web), **nimic**
  pentru `TRUSTED_PROXIES`.
- `api/src/env.ts:95` → `TRUSTED_PROXIES: z.string().default('127.0.0.1,::1,172.16.0.0/12')`.
- Runtime: adresa API este publicată doar pe `127.0.0.1:3100` (`compose.api.yml`), deci expunerea e limitată la
  rețeaua docker; orice container din `172.16/12` care ajunge la API poate își declara adresa în
  `X-Forwarded-For` și, prin urmare, și în `Session.ip` și în cheia limitelor de rată.

**Impact.** Încrederea este prea largă: orice gazdă din spațiul privat Docker poate falsifica adresa pe care
API-ul o înregistrează și o folosește drept cheie de limitare. Este cauza care face SESS-01 și SESS-02 greu de
remediat din aplicație.

**Corectare recomandată.**
1. `.env` de producție + `api/src/env.ts:95` — `TRUSTED_PROXIES` se setează explicit pe adresa containerului
   `web` (singurul care ajunge la API prin proxy) și, dacă este nevoie, pe cea a gateway-ului; implicitul
   `172.16.0.0/12` se elimină sau se restrânge la `/32`-urile reale.
2. `compose.yml` — după pasul 1, valoarea trebuie să rămână în acord cu `compose.web.yml`
   (`TRUSTED_PROXY_IPS: "${TRUSTED_PROXY_IPS:-}"`), ca web-ul și API-ul să aibă aceeași listă de adrese de
   încredere.

---

## Ce a funcționat (verificat, ca să fie spus limpede)

- **Identificarea sesiunii curente este corectă la nivel de API.** `serializeSession` compară id-ul rândului cu
  `request.sessionId`, iar `request.sessionId` este setat din rândul găsit după token
  (`api/src/plugins/auth.ts:141`, `api/src/routes/settings.ts:113`). Măsurat: în stiva izolată, fiecare dintre cele
  două browsere a văzut **exact o** sesiune cu `current: true` — cea a lui, nu a celuilalt.
- **Revocarea unei sesiuni funcționează și revocă sesiunea corectă.** `DELETE /settings/sessions/:id` verifică
  proprietatea (`api/src/routes/settings.ts:425-428`) și șterge pe id. Măsurat: browserul A a revocat sesiunea
  browserului B → răspuns `200 {"revoked":true,"current":false}`; la cererea următoare, B a primit **401**, iar A
  a rămas cu **200**.
- **Revocarea sesiunii curente funcționează.** A revocat propria sesiune → `200 {"revoked":true,"current":true}`;
  cererea următoare a primit **401** ( sesiune închisă imediat, în orice browser).
- **Schimbarea parolei închide celelalte sesiuni și păstrează sesiunea curentă.** `api/src/routes/settings.ts:388-389`
  șterge toate sesiunile contului mai puțin `request.sessionId`. Măsurat pe un cont dedicat creat pentru test:
  răspuns `200 {"changed":true,"closedSessions":2}`; dispozitivul care a schimbat parola a rămas cu **200** și a
  văzut în listă doar propria sesiune; celălalt dispozitiv a primit **401**.
- **Expirarea și curățarea funcționează.** `loadSession` șterge sesiunea expirată când este folosită
  (`api/src/plugins/auth.ts:135-139`), iar `pruneSessions` (`api/src/plugins/auth.ts:178-181`) este apelat de
  worker la fiecare oră (`api/src/worker.ts:167`). În producție: 0 sesiuni expirate rămase.
- **Cookie-ul sesiunii e corect configurat:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` după protocol
  (`api/src/plugins/auth.ts:97-105`), cu expirare la 14 zile.
- **Limita de rată a autentificării există și funcționează** — dar vezi SESS-02 pentru cheia folosită.

## Ce nu a putut fi verificat

- **Nu s-a putut verifica dacă un client poate fi „bruitat" cu un cookie de sesiune fals** printr-o cerere
  printr-un proxy de încredere al Cloudflare cu `X-Forwarded-For` modificat: singurul test făcut
  (`curl -H 'X-Forwarded-For: 203.0.113.9'`) a arătat că valoarea falsificată nu ajunge la API pe calea publică.
  Testul pe calea Cloudflare n-a putut fi făcut fără a atinge datele de producție.
- **Nu s-a putut verifica ce adresă este înregistrată pentru un client real venit prin Cloudflare**, fiindcă
  identificarea unei sesiuni anume ar necesita un token, iar identificatorii de rând din baza de producție nu pot
  fi asociați sigur cu un browser fără token. Concluzia SESS-01 se bazează pe agregate (adrese Cloudflare) și pe
  log-ul API, nu pe un rând individual.
- **Nu s-a putut verifica comportamentul după lansarea corecțiilor din arborele de lucru** (plafa de 20 de sesiuni,
  `fmtDateTime`, numele browserului de pe iOS): stiva izolată rulează buildul `3948f7f`, iar corecțiile sunt în
  arborele de lucru, nepublicate. Recomandarea e ca aceste trei schimbări să fie re-testate după lansare, cu
  aceeași metodă.
- **Nu s-a putut verifica comportamentul plafei de 20 de sesiuni în producție** (arborele de lucru): plafa se
  aplică doar la creare, iar efectul asupra unei sesiuni curente mai vechi nu a fost măsurat.
- **Nu s-a putut audita sesiunile din zona de staff** (`/admin`): contul de staff nu era disponibil în stiva
  izolată, iar accesul la producție era interzis. Mecanismul de sesiuni este comun cu cel al clienților, dar
  nicio verificare specifică zonei de staff nu a fost făcută.
- **Nu s-a putut verifica dacă lista de sesiuni de pe telefon (`take: 50`, lista plină) arată trunchiat**, fiindcă
  contul de test nu are 50+ de sesiuni în stiva izolată; în producție, cel mai mare cont are 182 de sesiuni, deci
  lista afișează doar ultimele 50 — efect observabil, dar nestingruit în interfață (nu există niciun indicator
  că lista este trunchiată).
