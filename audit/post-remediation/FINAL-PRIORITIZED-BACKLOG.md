# Backlog final prioritizat — Blipmade

**Data:** 2026-10-24
**Baza:** 212 constatări din `NEW-FINDINGS.md` (212 rânduri, unul pe constatare) + registrul
anterior `audit/12-FULL-FINDINGS-REGISTER.md` (182 constatări, revalidate) + verdictul
lead-ului `GO-NO-GO-VERDICT.md`
**Ce NU este acest document:** nu este un registru nou și nu repetă `NEW-FINDINGS.md`.
Acolo e **ce** e stricat. Aici e **ce se face, în ce ordine, și de cine**.

---

## 0. Metadate

### 0.1 Principiul de ordonare

Am folosit o ordonare în **șase clase de consecință de business**, **nu** o sortare după
severitate. Motivul e simplu și verificabil: în cele 212 constatări, **62%** sunt
Low/Medium, iar **19** sunt blocate de operator. O sortare după severitate ar pune în
față 62 de rânduri de gradul doi și ar ascunde faptul că **legătura restrictivă nu e
codul, ci cheile și deciziile**.

| Clasă | Principiu | Cum se traduce în rânduri |
|---|---|---|
| **1** | **Banii ies din platformă greșit sau nu pot fi încasați deloc** | Preț ≠ sumă, taxare dublă, factură pierdută, checkout oprit, produs care nu se livrează |
| **2** | **Platforma e expusă** | Escaladare de privilegii, backup inexistent pe hardware care poate muri, perimeter deschis, falsificarea adresei clientului, DoS pe autentificare |
| **3** | **Clientul nu poate cumpăra sau nu poate folosi ce a plătit** | Produsul nu se livrează, nu are adresă, stările mincinoase, biletul fără atașament, pagina de facturare goală |
| **4** | **Operatorul nu poate să o ruleze** | Fără monitorizare, fără backup off-host, fără paginare în liste, fără rollback |
| **5** | **E lentă sau se rupe la scară** | 452–558 KB necomprimați, 6 cereri identice, N+1 în preț, fără indici |
| **6** | **E urâtă sau incompletă** | Contrast sub prag, localizare, API public, plan free |

### 0.2 Regulile secundare, în ordine

În interiorul unei clase, rândurile sunt ordonate astfel:

1. **Ce deblochează altceva** merge primul (ordine de dependență, nu de severitate).
2. La egalitate de dependență, **efort mai mic** merge primul.
3. La egalitate de efort, **severitate mai mare** merge primul.

Această regulă e cea care face backlog-ul **executabil**: în clasa 1, „cheile Stripe"
(operator, S) e înaintea „factura cu TVA" (cod, M), pentru că fără chei nici factura nu
există.

### 0.3 Cum se citește tabelul

| Coloană | Ce înseamnă |
|---|---|
| **Ordine** | Poziția în lista unică. Ordine strictă; poți sari peste rânduri, dar nu le reordona. |
| **ID** | Identificatorul din raportul de origine. **Nu renumerotat.** Dacă un rând acoperă mai multe constatări, sunt enumerate toate. |
| **Ce trebuie făcut** | Acțiunea, nu constatarea. |
| **De ce e pe lista asta** | Legătura cu clasa și cu blocajul pe care îl elimină. |
| **Severitate** | `P0` · `Critical` · `High` · `Medium` · `Low-Info` |
| **Efort** | **S** = ≤1 zi · **M** = 2–5 zile · **L** = 1–3 săptămâni |
| **Dependență** | `cod` · `operator` · `terț` (Stripe, Pterodactyl, edge, DNS) — și combinații |
| **Blocaje** | Ce **nu** se poate face până când rândul de mai sus e închis |
| **Criteriu de ieșire** | Măsurabil. „Gata" înseamnă că verificarea asta dă rezultatul ăsta. |
| **Document sursă** | De unde vine rândul, pentru trasabilitate |

### 0.4 Convenții

- **Efortul total** al unei unde se calculează ca suma efortelor rândurilor din ea, cu
  convenția `S = 1`, `M = 3`, `L = 8` zile-lucrătoare.
- **Undele** sunt compatibile cu `MISSING-FEATURES-ROADMAP.md` §5 (Unda 0 … Unda 4).
  Adaug o **Unda −1** („Integritatea procesului"), care **nu există** în roadmap și
  este necesară pentru că `SYN-P1-01` produce un build stricat.
- **Total rânduri în tabel:** 76. Acestea acoperă toate cele 212 constatări prin
  agregare; constatările `Low-Info` fără acțiune (igienă, documentație, aliasuri de
  rute) sunt grupate la final, în rândul 76.

---

## 1. Tabelul principal

| Ordine | ID | Ce trebuie făcut | De ce e pe lista asta | Sev | E | Dep. | Blocaje | Criteriu de ieșire (măsurabil) | Document sursă |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `SYN-P1-01` | Scrie sursa într-un director separat; `rsync`/`cp` atomic în `/opt/blipmade`; build-ul rulează `tsc` + `vitest` **înainte** de a înlocui imaginea | Un build stricat = container în crash-loop = platforma jos. S-a observat `ReferenceError: body is not defined` la `admin.ts:1:33` | **Critical** | M | cod + operator | — | Un build din sursa curentă pornește și toate containerele sunt `healthy` după `docker compose up -d`; niciun fișier din `/opt/blipmade/api/src` nu diferă de commit | `NEW-FINDINGS.md` §7.1 |
| 2 | `SYN-P1-02` | `setup.ts` refuză să ruleze dacă `stripeTestGateway() === false`; fiecare test de plată aserționează codul HTTP al webhook-ului, nu doar starea finală | 9 din 10 aserțiuni de plată trec **vacuum** când poarta e închisă → verde fals exact pe garda banilor | **High** | S | cod | — | Suite-ul de plată **refuză** să ruleze cu poarta închisă și **eșuează** dacă webhook-ul răspunde ≠ 200 | `NEW-FINDINGS.md` §7.2 |
| 3 | `INFRA-P1-18`, `INFRA-P1-19`, `SYN-P2-02` | Oprește stack-urile de audit de pe `0.0.0.0` (30003/30004/30005/3112/3113); oprește PID 46931/46943 (proces de audit cu `DATABASE_URL` de producție, script șters de pe disc); limitează LLMNR la `127.0.0.1` | Igienă, dar un proces viu cu credențiale de producție e o suprafață de produs deschisă | Medium | S | operator | — | `ss -ltnp` nu mai arată porturi de audit pe `0.0.0.0`; niciun proces nu mai are `DATABASE_URL=…/blipmade` în mediu | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 4 | `PAR-P1-03`, `COMP-P1-02`, `FN-P1-10`, `PAR-P1-24` | `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `PAYMENTS_ENABLED=true` | **Fără asta nu există venit.** Fiecare zi e o zi de vânzare pierdută | **P0** | S | operator | — | `POST /api/orders/:id/checkout` întoarce o sesiune Stripe reală; un `checkout.session.completed` real marchează comanda `PAID` | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 5 | `PAR-P1-04`, `COMP-P1-01`, `PAR-P1-13`, `CJ-P1-12` | Imagine Docker reală + ou mapat per produs; `eggId` real; **un produs de joc real** în catalog | Nu se poate vinde ceea ce nu se livrează. Fiecare vânzare ca produs generic = rambursare + recenzie negativă | **P0** | M | operator + cod | — | `SELECT count(*) FROM "Product" WHERE deployable = true AND ("eggId" IS NULL OR "dockerImage" IS NULL)` → **0**; un produs de joc în catalog cu health-check pe **aplicație**, nu pe `/health` | `COMPETITIVE-GAP-ANALYSIS.md` §9 |
| 6 | `PAR-P1-06`, `COMP-P1-05`, `FN-P1-25` | `DOMAIN_BASE` + `CADDY_ADMIN_URL` + `CADDY_ADMIN_TOKEN`; rutare la edge | Server fără adresă publică nu e un produs vandabil | **P0** | S | operator | — | Un subdomeniu real rezolvă DNS și răspunde din afara rețelei interne | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 7 | `PAR-P1-05`, `COMP-P1-11`, `FN-P1-07` | `SMTP_URL` + transport `smtp` (nu `file`) | Nimic nu ajunge la client: cont, factură, bilet, resetare de parolă. E-mailurile tranzacționale ocolesc și coada | **P0** | S | operator | — | Un e-mail de confirmare de cont ajunge într-un inbox real (nu într-un fișier); `/status` nu mai raportează „Support — Degraded" | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 8 | `FN-P1-26`, `CJ-P1-02`, `PAR-P1-01` | Emite și afișează factura proprie după plată (`billing.ts` scrie `Invoice`, pagina o citește) | Clientul plătește și nu primește nicio factură. În UE, o firmă fără factură nu plătește | **P0** | M | cod | rândul 4 | După o plată reușită, `GET /api/billing/invoices` întoarce ≥1 factură, iar ea apare pe pagina de facturare | `CUSTOMER-JOURNEYS.md` §CJ-P1-02 |
| 9 | `PAR-P1-02`, `COMP-P1-07` | Model `TaxRate` + `Tax` pe factură; decizie: rată, bază (net / TVA-inclus), tratament B2B | Factura fără TVA nu e deductibilă și nu se poate vinde „cu TVA inclus" | **P0** | M | operator (decizie) + cod | rândul 8 | Factura afișează rată, bază, TVA și total; suma totală = bază + TVA | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 10 | `PAR-P1-08` | Factură proprie (PDF server-side, cu TVA, număr fiscal, date emitent) în locul PDF-ului Stripe | Factura Stripe nu are TVA, nu are datele emitentului, nu e în limba clientului | High | M | cod | rândurile 8–9 | PDF-ul facturii e generat de platformă și conține TVA + date fiscale | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 11 | `FIN-P2-06`, `FN-P1-06` | O comandă gratuită produce factură de 0, nu un rând `Payment` cu `status='SUCCEEDED'`, `amount=0` | Falsifică raportul de încasări; un `Payment` „reușit" de 0 lei e o minciune contabilă | Medium | S | cod | — | `SELECT count(*) FROM "Payment" WHERE amount = 0 AND status = 'SUCCEEDED'` → **0** | `FINANCIAL-INTEGRITY.md` §4 |
| 12 | `FN-P1-14`, `PAR-P1-10` | Propagă `quantity` în `buildQuote`, nu doar în comandă | Prețul afișat ≠ prețul plătit → dispute pe banii clientului | High | S | cod | — | `POST /api/catalog/quote` cu `quantity: 3` întoarce `quantity: 3` pe fiecare linie | `FUNCTIONAL-COVERAGE.md` §FN-P1-14 |
| 13 | `CJ-P1-09` | Debounce / buton dezactivat + cheie de idempotență la crearea comenzii | O dublă apăsare creează două comenzi → două cereri de plată | Medium | S | cod | — | Două clicuri rapide pe „Order" produc **o** comandă | `CUSTOMER-JOURNEYS.md` §CJ-P1-09 |
| 14 | `SYN-P2-01`, `FIN-P2-01` | `upsertInvoice()` folosește `nextInvoiceNumber()`, nu `invoice.count() + 1` | Două surse de adevăr pentru numărul factură: un eveniment Stripe prin calea veche eșuează pe unicitate și **nu se înregistrează nicio factură** | Medium | S | cod | — | `grep -n "invoice.count" api/src/` → **0**; toate facturile vin din contorul atomic | `NEW-FINDINGS.md` §7.4 |
| 15 | `FIN-P2-02` | `fulfilOrder()` creează instanța într-o tranzacție, cu `provisioningKey` unic | Cursa: a doua creare aruncă `P2002` și evenimentul trece în `failed` + reîncercare | Medium | S | cod | — | 10 livrări concurente ale aceleiași comenzi → exact **1** instanță, **0** evenimente `failed` | `FINANCIAL-INTEGRITY.md` §4 |
| 16 | `FN-P1-08`, `SEC-P4-01`, `CJ-P1-08` | `webhooks/stripe/failed` și `replay` răspund 401/403 pe token greșit; comparație în timp constant | Un 200 cu corp de eroare ascunde eșecul de autentificare în fața unui client care verifică doar codul | Medium | S | cod | — | `GET /webhooks/stripe/failed` fără token → **401**, nu 200 | `SECURITY-REVIEW.md` §4 |
| 17 | `PAR-P1-26` | Workerul raportează eșecurile: log pe nivel + contor de eșec expus în `/health` | Bucle ale workerului înghit erorile → divergența facturilor locale față de Stripe persistă nedetectată | Medium | S | cod | — | O eroare injectată în reconcilierea Stripe apare în `/health` în ≤ 60 s | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 18 | `PAR-P1-25`, `SEC-P4-03`, `INFRA-P1-13` | TTL explicit pe joburile `failed` + sweep de retenție pornit; dead-letter durabil | Un job eșuat definitiv e șters după 10 minute — nu mai există diagnostic și nu există reluare | Medium | S | cod | — | Un job eșuat e încă în coadă după 30 de minute și apare într-un dead-letter listabil | `SECURITY-REVIEW.md` §4 |
| 19 | `FN-P1-01`, `FN-P1-15` | Câmpuri `defaultRam/defaultCpu/defaultDisk` în schema Zod a `POST`/`PATCH /admin/products`, validate `min ≤ default ≤ max`; expuse în `admin/Pricing.tsx` | Configurația „recomandată" e identică cu minimul → prețul recomandat nu există | High | M | cod | — | Un produs cu `defaultRam=2048` afișează `pricing.recommended.ram = 2048` **și** un preț diferit de minim | `FUNCTIONAL-COVERAGE.md` §FN-P1-01 |
| 20 | `FN-P1-03`, `CJ-P1-01` | Pagina de facturare citește parametrul `checkout` și afișează starea plății | Clientul plătește și revine pe o pagină care nu știe de ce a venit: „THIS MONTH (ESTIMATE) €0.00" | High | S | cod | rândul 4 | După checkout, `/app/billing?checkout=…` afișează suma și starea plății, nu €0.00 | `CUSTOMER-JOURNEYS.md` §CJ-P1-01 |
| 21 | `PAR-P1-15` | Citește starea instanței din panou la fiecare încărcare, cu mapare `online→ONLINE` / `offline→DEGRADED` | Clientul plătește un serviciu pe care nu îl poate folosi, **fără niciun semnal** | High | M | cod | acces la panou | Panoul oprit → pagina instanței arată „Degraded" în ≤ 30 s | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 22 | `CJ-P1-10` | Prima instanță a fiecărui ou se poate provisiona fără server-șablon creat de om | Fără ea, **nu se poate vinde nimic** până când un operator face munca manuală | High | M | cod | — | Prima comandă de pe un ou nou se provisionează **fără** interacțiune umană | `CUSTOMER-JOURNEYS.md` §CJ-P1-10 |
| 23 | `FN-P1-02`, `PAR-P1-12`, `CJ-P1-03`, `CJ-P1-11` | Client multipart în `TicketDetail.tsx` → `POST /tickets/:id/attachments`; legătură de descărcare; notificarea de bilet merge la inbox-ul de suport | Fiecare bilet de suport fără log se rezolvă prin refuz; în game hosting, e client pierdut | High | M | cod | rândul 7 (SMTP) | După trimiterea unui răspuns cu fișier: 1 rând în `Attachment`, `sha256` descărcat identic, e-mail primit de suport | `FUNCTIONAL-COVERAGE.md` §FN-P1-02 |
| 24 | `SYN-P1-03`, `SESS-P1-03` | `resolveClientAddress` parcurge lanțul `X-Forwarded-For` **de la dreapta la stânga**, sărind peste adresele de încredere | **Cauza rădăcină** a lui `SEC-P1-02`, `SESS-P1-04`, `CJ-P1-07`: clientul își alege adresa, deci rate-limit-ul, contorul de autentificare și jurnalul se falsifică | **High** | S | cod | — | Un `X-Forwarded-For` cu prefix fals, trimis printr-un proxy de încredere, produce adresa **reală** a clientului | `NEW-FINDINGS.md` §7.3 |
| 25 | `SEC-P1-02`, `SESS-P1-04`, `SESS-P1-02`, `CJ-P1-07`, `INFRA-P1-09` | Cheia limitatorului devine adresa reală a clientului (rezolvată + verificată contra proxy-ului); `TRUSTED_PROXIES` restrâns | După rândul 24, cheia rămâne `request.ip` — deci fixarea nu se vede | High | M | cod + operator | rândul 24 | `LOGIN_RATE_LIMIT_MAX` cereri de la **două** adrese diferite nu se blochează reciproc; `TRUSTED_PROXIES` conține doar bridge-ul Docker | `SECURITY-REVIEW.md` §4 |
| 26 | `ADM-P2-06`, `SESS-P1-05`, `CJ-P1-06`, `FN-P1-33`, `SEC-P3-02` | Contorul per cont numără **doar eșecurile** și nu se aplică adreselor inexistente; mesajul 429 spune durata de așteptare | Un apelant poate bloca inclusiv adresa unui administrator cu 10 cereri, fără o parolă greșită măcar o dată | Medium | S | cod | — | 11 autentificări **reușite** consecutive → toate 200; 11 autentificări **greșite** pe o adresă inexistentă → 429 doar pe acea adresă | `ADMIN-FUNCTIONALITY.md` §ADM-P2-06 |
| 27 | `SESS-P1-06`, `CJ-P1-05` | Schimbarea adresei de e-mail cere parola curentă și încheie celelalte sesiuni | Un cont compromis își schimbă e-mail-ul fără nicio urmă și își păstrează sesiunile | Medium | M | cod | — | `POST /api/settings/email` fără `currentPassword` → **400**; după schimbare, celelalte sesiuni sunt revocate | `CUSTOMER-JOURNEYS.md` §CJ-P1-05 |
| 28 | `SESS-P1-07` | Închiderea contului încheie toate sesiunile; există instrument de administrare | Contul „închis" rămâne activ până la expirarea sesiunilor | Medium | M | cod | — | După o cerere de închidere: `SELECT count(*) FROM "Session" WHERE "userId" = … AND "expiresAt" > now()` → **0** | `SESSIONS-INVESTIGATION.md` §SESS-P1-07 |
| 29 | `INFRA-P1-01`, `SEC-P2-02`, `PAR-P1-16`, `COMP-P1-03` | `OFFSITE_TARGET` + `OFFSITE_KEY` + `rclone` instalat + drill de restaurare | Cu RAID 0 sub gazdă, pierderea hostului pierde **tot** — inclusiv `SESSION_SECRET`, ireversibil | **Critical** | M | operator | — | O arhivă completă există **în afara gazdei**, e criptată, și drill-ul o restaurează într-o bază de scratch | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 30 | `INFRA-P1-02` | RAID 1 pe `/` (decizie de infrastructură) | O singură eroare de disc pierde simultan platforma și datele | **Critical** | S | operator | — | `lsblk` arată mirroring pe `/`; un test de eșec controlat de disc nu pierde date | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 31 | `INFRA-P1-03`, `INFRA-P1-04`, `SEC-P2-01` | Firewall pe hipervisor: `22`, `111`, `8006`, `3128` private; `INPUT DROP` + `FORWARD DROP` pe VM | Consola Proxmox, rpcbind și spiceproxy sunt publice **pe adresa care servește și platforma** | **Critical** | M | operator | — | Din afara segmentului `10.77.0.0/24`, porturile 111, 3128 și 8006 nu răspund; 22 răspunde doar pe adresa internă | `INFRASTRUCTURE-AND-RECOVERY.md` §4 |
| 32 | `SEC-P3-01` | Actualizează `nodemailer` și celelalte dependențe cu vulnerabilități aplicabile | `nodemailer` e mult în urmă; `npm ci --omit=dev` nu scoate codul vechi | Medium | S | cod | — | `npm audit --json` în `api/` → **0** vulnerabilități aplicabile în `dependencies` | `SECURITY-REVIEW.md` §4 |
| 33 | `SEC-P2-03`, `FN-P1-32`, `SESS-P1-13` | Stiva de test nu mai refolosește secretele de producție; Redis propriu (index dedicat) | Webhook-ul de test fără semnătură + secretele de producție într-o stivă accesibilă din rețea | Medium | M | cod + operator | — | Stack-ul de test pornește cu `SESSION_SECRET` și `INTERNAL_API_TOKEN` **generate**, nu cele de producție | `SECURITY-REVIEW.md` §4 |
| 34 | `SEC-P3-03` | `.max()` pe colecțiile din cotare | Un corp de 2 MB cu zeci de mii de elemente trece validarea | Low-Info | S | cod | — | `POST /api/billing/quote` cu 1000 de elemente → **400** | `SECURITY-REVIEW.md` §4 |
| 35 | `SEC-P4-02`, `INFRA-P1-20` | Activează `Content-Security-Policy` și `Strict-Transport-Security` | Fără CSP, un `XSS` în interfață nu e limitat | Low-Info | S | cod | — | `curl -I` pe ruta publică include `Content-Security-Policy` și `Strict-Transport-Security` | `SECURITY-REVIEW.md` §4 |
| 36 | `ADM-P1-02`, `ADM-P3-04` | `assertMayActOnAccount` acoperă și schimbarea **titlului** unui administrator; `role`/`title`/`permissions` au aceeași regulă | Un personal ne-administrator poate schimba titlul unui administrator | Low | S | cod | — | `PUT /admin/staff/:id` cu `title` pe un cont `ADMIN`, de către un `STAFF` → **403** | `ADMIN-FUNCTIONALITY.md` §ADM-P3-04 |
| 37 | `INFRA-P1-10` | `TRUSTED_PROXIES` explicit, restrâns la bridge-ul Docker | API-ul are încredere în întregul bridge | Medium | S | cod + operator | — | `TRUSTED_PROXIES` conține exact CIDR-ul bridge-ului, nu `172.16.0.0/12` | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 38 | `SESS-P1-08` | `openSession` serializează rotirea pe baza cookie-ului | Două semnări simultane cu același cookie produc două sesiuni | Medium | S | cod | — | 20 de cereri simultane cu același cookie → **1** sesiune | `SESSIONS-INVESTIGATION.md` §SESS-P1-08 |
| 39 | `PAR-P1-17`, `COMP-P1-17` | TOTP pentru `STAFF` și `ADMIN`, cu cheie de recuperare | Platforma deține chei Stripe și token-uri de panou; absența 2FA e o slăbiciune de credibilitate la clienți corporate | Medium | M | cod | — | Un `ADMIN` fără TOTP activat nu poate intra; cheia de recuperare e generată o singură dată | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 40 | `CJ-P1-04` | `limit`/`offset` reali pe lista de bilete | `?limit=2&offset=0` întoarce toate cele 6 bilete | Medium | S | cod | — | `GET /api/tickets?limit=2` → exact **2** rânduri | `CUSTOMER-JOURNEYS.md` §CJ-P1-04 |
| 41 | `FN-P1-21` | `currentPeriodEnd` se populează din perioada reală a abonamentului | Clientul plătitor vede „CURRENT PERIOD ENDS — Not available" | Low-Info | S | cod | rândul 4 | După o plată reușită, `currentPeriodEnd` e o dată **viitoare**, nu `null` | `FUNCTIONAL-COVERAGE.md` §FN-P1-21 |
| 42 | `FN-P1-04`, `PAR-P1-31` | Tab de metrici cu consum real și istoric | Documentația promite „Check the metrics" — pagina nu există | Medium | M | cod | — | `/app/instances/:id` are tabul „Metrics" cu valori reale; sweep-ul de accesibilitate nu mai raportează linkuri moarte | `FUNCTIONAL-COVERAGE.md` §FN-P1-04 |
| 43 | `FN-P1-31` | Ecran pentru `POST /orders/:id/cancel` | Clientul nu poate anula o comandă neplătită din interfață | Low-Info | S | cod | — | Un buton „Cancel" anulează o comandă `PENDING` și lista se actualizează | `FUNCTIONAL-COVERAGE.md` §FN-P1-31 |
| 44 | `UX-P1-01` | `--color-ink-3: #8a9090` | 2 334 de elemente de text sub pragul WCAG AA, pe 21 de rute | High | S | cod | — | Sweep-ul pe 32 de rute × 6 lățimi raportează **0** eșecuri de contrast | `UI-UX-REVIEW.md` §4.1 |
| 45 | `UX-P1-02` | Coada de suport: coloană de detaliu lățime reală, subiecte tăiate, coloana „Assigned" vizibilă | Suportul lucrează în coadă toată ziua, pe cele mai înguste ecrane | High | M | cod | — | La 1440 px, coloana „Assigned" e vizibilă și nicio valoare nu e tăiată fără `title` | `UI-UX-REVIEW.md` §4.2 |
| 46 | `UX-P1-03`, `UX-P1-04`, `UX-P1-05`, `UX-P1-06`, `UX-P1-07`, `UX-P1-09`, `UX-P1-10`, `UX-P1-11`, `UX-P1-12`, `UX-P1-13`, `UX-P1-14`, `ADM-P3-01`, `FN-P1-13` | 80 de celule cu valoare irecuperabilă; rânduri de sesiuni distincte; numele de instanță persistent; antet lipicios; ținte de 21 px; `h1` pe `/apps`; unități pe selectori; câmpuri de nume | Igienă și credibilitate; niciunul nu blochează GO-ul, toate sunt ieftine | Medium | M | cod | — | Sweep-ul de accesibilitate raportează **0** eșecuri pe cele 32 de rute; nicio celulă nu e tăiată fără cale de recuperare | `UI-UX-REVIEW.md` §4 |
| 47 | `INFRA-P1-12` | Agent de monitorizare + releu de alerte (backup, disc, OOM, container down) | La 3 dimineața, un backup eșuat sau un OOM nu produc niciun semnal | Medium | M | operator | — | Un backup eșuat generează o alertă în ≤ 5 min; un container oprit generează alertă în ≤ 2 min | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 48 | `INFRA-P1-06` | `max-size`/`max-file` pe toate containerele | Jurnalele Docker cresc fără limită | High | S | cod | — | `docker inspect` arată `max-size` pe fiecare container; dimensiunea totală a jurnalelor e sub 2 GB | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 49 | `INFRA-P1-07` | `archive_mode=on` + `wal_level=replica` + arhivare WAL | Corupția logică nu e recuperabilă fără PITR | High | M | operator | — | `SHOW archive_mode` → `on`; un restore la un punct în timp e demonstrat într-o bază de scratch | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 50 | `INFRA-P1-08` | Include volumul `upload_data` în arhivă | Fișierele clientului nu sunt în backup | High | S | cod | — | Arhiva conține `upload_data` și un fișier pus acolo e **restaurabil** | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 51 | `INFRA-P1-15` | Registru de imagini cu tag-uri imutabile + cale de rollback | Tag `latest`, fără registru: rollback-ul e un build, nu o operație | Medium | M | operator | — | Fiecare imagine deployată are un tag cu digest; rollback-ul la versiunea anterioară e o operație documentată și executată | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 52 | `INFRA-P1-11` | `requestId` corelabil: propagat în jurnal și în răspuns | Incidentul nu poate fi urmărit de la „requestId" la linia de jurnal | Medium | S | cod | — | Un `requestId` din răspuns apare **literal** în linia de jurnal corespunzătoare | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 53 | `INFRA-P1-14`, `COMP-P1-12` | `/api/status` nu dezvăluie topologia; cache + paralelism | Numărul de porturi libere e public; o pagină care raportează permanent „Degraded" e o declarație publică de incident | Medium | M | cod | rândul 54 | `/api/status` nu conține porturi interne; răspunsul în ≤ 1 s | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 54 | `PERF-P1-07` | Cache + apeluri paralele spre panou în `/api/status` | Pagina publică de stare durează **4 secunde** și, cu panou lent, ajunge la zeci de secunde | Medium | M | cod | — | `/api/status` răspunde în ≤ 1 s cu panoul oprit | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 55 | `ADM-P2-03`, `PAR-P1-27` | Paginare, sortare și căutare pe listele administrative | Peste 200 de clienți, adminul nu vede tot — și numărul crește după lansare | Medium | M | cod | — | Lista de clienți are paginare; căutarea e server-side; interogarea e indexată | `ADMIN-FUNCTIONALITY.md` §ADM-P2-03 |
| 56 | `ADM-P2-01`, `ADM-P2-02`, `PAR-P1-29` | Separă „customers.read" de accesul la cifre; filtrează navigația pe permisiuni | Un rol de citire vede venitul și MRR-ul întregii platforme | High | M | cod | — | Un cont cu `customers.read` **și fără** `settings.read` nu primește venit/MRR; niciun link nepermis nu apare în navigație | `ADMIN-FUNCTIONALITY.md` §ADM-P2-01 |
| 57 | `FN-P1-05`, `PAR-P1-23` | Afișează contorul din `PromotionRedemption`; elimină `usedCount` | Operatorul vede un număr greșit și nu-și dă seama câte locuri mai are la o campanie | Medium | S | cod | — | Contorul din admin = `SELECT count(*) FROM "PromotionRedemption"` | `FUNCTIONAL-COVERAGE.md` §FN-P1-05 |
| 58 | `FN-P1-11`, `ADM-P3-06`, `PAR-P1-28` | `GET /admin/money` calculează real din `Invoice`/`Subscription` pe perioadă | Operatorul nu poate sari peste MRR-ul real, deci nu poate decide prețuri | Low-Info | S | cod | — | MRR-ul afișat corespunde cu suma facturilor emise în perioada curentă | `FUNCTIONAL-COVERAGE.md` §FN-P1-11 |
| 59 | `ADM-P2-04`, `ADM-P2-05`, `FN-P1-12` | Operații în masă în API + interfață; expune cele 8 rute existente fără ecran; formular pentru `POST /auth/enroll-admin` | Funcționalitate lipsă pentru operator: trasee care există în cod și nu se pot folosi | Medium | M | cod | — | Cele 8 rute au un ecran; un admin nou poate fi enrolled din interfață | `ADMIN-FUNCTIONALITY.md` §ADM-P2-05 |
| 60 | `PERF-P1-01` | Compresie gzip/brotli în `web/server.mjs` (sau `.gz`/`.br` la build) | 452–558 KB transferați, din care 352–426 KB JavaScript brut, pentru un bundle de 93 KB gzip. Cel mai mare cost măsurabil pe mobil | High | M | cod | — | `curl -H 'Accept-Encoding: gzip'` → `Content-Encoding: gzip`, `Content-Length` ≈ 95 332; retragerea pe `/` sub 200 KB | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 61 | `PERF-P1-02`, `UX-P1-08` | Landing-ul cere catalogul **o singură dată**: exportă și folosește `loadCatalog()` din `web/src/lib/pricing.ts` | 6 cereri identice → 6,9 tranzacții identice la fiecare vizită a celei mai vizitate pagini | High | S | cod | — | Traseu de rețau pe `/`: `GET /api/catalog/products` apare **o singură dată** | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 62 | `PERF-P1-03` | `priceItems` încarcă prețurile și opțiunile în bloc | N+1: 2 interogări per element din coadă; p50 de la 17 ms la 35 ms la 8 produse — și rulează la crearea comenzii | High | M | cod | — | Cotarea unui coș de 8 produse face **≤3** interogări, nu 16 | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 63 | `PERF-P1-04` | Indici pe `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt`, `Ticket.status` (+ migrare) | Listele degradează ×3,1→×5,8; la 10 000 de clienți panoul devine inutilizabil | High | M | cod + migrare | — | `EXPLAIN ANALYZE` pe lista de clienți nu mai arată `Seq Scan` pe coloanele sortate | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 64 | `PERF-P1-15`, `INFRA-P1-16` | `log_min_duration_statement = 250ms` | Fără observabilitate, nicio optimizare viitoare nu poate fi justificată cu date | High | S | operator | — | Interogările peste 250 ms apar în jurnalul Postgres | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 65 | `PERF-P1-16`, `INFRA-P1-05` | `mem_limit`/`cpus` pe containere + swap pe gazdă | Un vârf de memorie într-un container omoară hostul, deci și baza de date | High | S | cod + operator | — | Fiecare container are limită de memorie și CPU; `free -h` arată swap activ | `INFRASTRUCTURE-AND-RECOVERY.md` §5 |
| 66 | `PERF-P1-18` | Workerul de provisionare: concurență mărită + circuit breaker pe panou | Un panou indisponibil produce ≈75 s de rețries pe job și ocupă slotul de worker 15 minute | Medium | M | cod | — | Un panou oprit produce **circuit breaker** în ≤ 60 s, fără rețries | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 67 | `PERF-P1-19` | `stop_grace_period` + timeout de oprire în compose | O cerere lentă e întreruptă cu `SIGKILL` în fereastra de deploy | Medium | S | cod | — | O cerere de 30 s se termină curat într-un deploy | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 68 | `PERF-P1-12` | Rate limiting pe rutele de citire rămase | Limitarea acoperă doar o parte din endpoint-uri | Medium | S | cod | — | Fiecare rută de citire e sub limita declarată | `PERFORMANCE-AND-RELIABILITY.md` §3.1 |
| 69 | `PERF-P1-05`, `PERF-P1-06`, `PERF-P1-08`, `PERF-P1-17`, `PERF-P1-20`, `PERF-P1-09`, `PERF-P1-10`, `PERF-P1-11`, `PERF-P1-13`, `PERF-P1-14`, `PERF-P1-21` | `count(*)` pe jurnal; contor atomic pentru numărul de comandă; cache de sesiune; `connection_limit` explicit; `/ready` real; eliminarea fonturilor 404; preload; `ETag`; `import()` dinamic; cache la margine | Restul optimizărilor măsurate. Niciuna nu blochează GO-ul | Low-Info | M | cod | — | Fiecare are criteriul său de verificare, în raportul de performanță | `PERFORMANCE-AND-RELIABILITY.md` §3.3 |
| 70 | `PAR-P1-07`, `COMP-P1-06` | i18n cu `ro` + `en`; `locale` din profil sau `Accept-Language`; `Intl.NumberFormat` per locale | `en-IE` e **irlandeză** — formatarea banilor e vizibil greșită pentru un client RO, pe pagina de checkout | High | M | cod | — | `Intl.NumberFormat('ro-RO').format(239)` apare în interfață pe pagina de checkout | `COMPETITIVE-GAP-ANALYSIS.md` §9 |
| 71 | `PAR-P1-14`, `COMP-P1-15` | Cheie API + un subset REST documentat (servicii, facturi, instanțe, bilete) | Blipmade nu poate fi integrat: reseller, Discord bot, n8n, monitorare externă | High | M | cod | rândurile 4, 8 | `openapi.json` public descrie ≥20 de operații; o cheie API autentifică o interogare de bilete | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 72 | `PAR-P1-32`, `COMP-P1-18`, `PAR-P1-13` | `PlanType` în `ProductPrice` (FREE / ONE_TIME / RECURRING); `BillingPeriod` extins la zile/săptămâni | Fără plan free nu există prag de intrare: un vizitator care nu vrea să plătească nu are nicio treaptă | Medium | M | cod + operator (decizie) | rândul 4 | Catalogul conține un preț `FREE` și un `ONE_TIME`; un client nou poate trece printr-un produs gratuit | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 73 | `PAR-P1-19`, `PAR-P1-20` | `perUserLimit` pe `Product` (aplicat în `buildQuote`); tabel de joncțiune promoție↔produs | Fără plafon per client, un client poate cumpăra oricâte servere; fără promoție pe produse, nu se poate lansa „20% doar la Minecraft" | Medium | M | cod | — | `buildQuote` respinge cotarea peste `perUserLimit`; o promoție se limitează la un produs | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 74 | `PAR-P1-30` | `CancellationReason` pe instanță + model `Credit` | Fără motiv de anulare nu se poate măsura **de ce** pleacă clienții | Low-Info | M | cod | — | Fiecare instanță anulată are un motiv; creditul de cont e înregistrat în bilet | `PAYMENTER-FEATURE-PARITY.md` §6 |
| 75 | `COMP-P1-09` | Plafon de RAM la 6 GB pentru produsul de joc (decizie de portofoliu) | La 8 GB / 2 vCPU / 50 GB prețul e €7,39, iar un VPS de 8 GB / 4 vCPU e €5,50 — clientul compară și pleacă | High | S | operator | rândul 5 | Niciun produs din catalog nu permite o configurație sub €5,50 la 8 GB RAM | `COMPETITIVE-GAP-ANALYSIS.md` §9 |
| 76 | `FN-P1-17`, `FN-P1-18`, `FN-P1-19`, `FN-P1-24`, `FN-P1-20`, `FN-P1-22`, `FN-P1-27`, `FN-P1-28`, `FN-P1-29`, `FN-P1-30`, `FN-P1-34`, `FN-P1-12`, `ADM-P2-04`, `ADM-P3-02`, `ADM-P3-03`, `ADM-P3-05`, `PAR-P1-18`, `PAR-P1-21`, `PAR-P1-33`, `PAR-P1-34`, `COMP-P1-08`, `COMP-P1-10`, `COMP-P1-13`, `COMP-P1-12`, `COMP-P1-14`, `COMP-P1-16`, `COMP-P1-19`, `COMP-P1-20`, `FN-P1-09`, `FN-P1-16`, `FN-P1-23`, `INFRA-P1-21`, `INFRA-P1-22`, `INFRA-P1-23`, `FIN-P3-01`, `FIN-P3-02`, `FIN-P3-03`, `SESS-P1-09`, `SESS-P1-10`, `SESS-P1-11`, `SESS-P1-12`, `SESS-P1-14`, `UX-P1-14` | Igienă, documentație, aliasuri de rute, capete moarte, cosmetică, plus cele 5 constatări `NOT VERIFIED` care cer o metodă de verificare, nu o reparare | **Nu blochează nimic.** Se fac când e timp; nu se taie din criteriile de ieșire ale undelor | Low-Info | M | cod | — | Fiecare rând are criteriul său în raportul-sursă | Toate rapoartele |

---

---

## 1bis. Ce este deja închis (nu apare ca rând de lucru)

13 constatări au fost închise înainte de această sinteză. **Nu apar în tabelul
principal**, pentru că nu mai e lucru de făcut — dar apar aici, ca închidere
explică, cu dovada.

| ID | Ce s-a închis | Cum | Dovada de regresie |
|---|---|---|---|
| `SEC-P1-01` | Atributul `Secure` al cookie-ului de sesiune în producție | cod, faza 13 (`2e1e78a`) | `phase2-session-security.test.ts` — 3 teste verzi |
| `FIN-P1-01` | Plata unei comenzi anulate/rambursate | cod, faza 13 | `phase2-payment-safety.test.ts` — „refuses to pay a dead order" |
| `FIN-P2-03` | Propagarea perioadei de preț în comandă | cod, faza 13 | „quotes a yearly plan with the yearly price" |
| `FIN-P2-04` | Readucerea în circuitul de plată a unei comenzi anulate | cod, faza 13 | „never pays a cancelled order and provisions nothing" |
| `FIN-P2-05` | Dublarea contorului `Promotion.usedCount` | cod, faza 13 | acoperit de testele de plată |
| `ADM-P1-01` | Escaladarea de privilegii prin `PUT /admin/staff/:userId` | cod, faza 13 | `phase2-access-control.test.ts` — 3 teste verzi |
| `ADM-P1-02` | Suspendarea unui cont de administrator sau de personal | cod, faza 13 | „refuses to suspend an administrator" |
| `PAR-P1-09` | = `FIN-P2-03` | cod, faza 13 | idem |
| `PAR-P1-11` | = `FIN-P2-04` | cod, faza 13 | idem |
| `PAR-P1-22` | Verificarea sumei nu se dezactivează când suma lipsește | cod, faza 13 | „keeps a payment event that carries no amount from being applied" |
| `SESS-P1-01` | Producția rulează build-ul cu plafon de sesiuni | **deploy** (`2e1e78a`) | `MAX_SESSIONS_PER_USER = 20` în imaginea deployată |
| `DR-02` / `FN-P1-09` | Programarea backupului | **acțiune de operator** | timer instalat, `enabled`, rulare cu arhivă + `.sha256` |
| `FIN-P2-01` | Afirmația „numerele de factură se calculează cu `count()+1`" | **INVALID** — dar **restul rămâne**, ca rândul 14 | vezi `NEW-FINDINGS.md` §2 C3 |

**Dovada de regresie a fazei 13**, rulată de mine pe arborele **deployed**
(`/opt/blipmade/api`), pe baza `blipmade_synth_test` (creată de mine, sufix `_test`
cerut de `api/tests/setup.ts`):

```
Test Files  3 passed (3)
     Tests  31 passed (31)
```

**Rămân deschise**, pentru că sunt **mecanisme**, nu rânduri de cod:
`SESS-P1-01` (controlul de release) → **rândul 1**, `SEC-P2-02` / `INFRA-P1-01` (copia
off-host) → **rândul 29**, `PAR-P1-22` (joburile eșuate) → **rândul 18**.

---

## 2. Undelor

Undele sunt **compatibile cu `MISSING-FEATURES-ROADMAP.md` §5** (Unda 0 … Unda 4). Adaug
**Unda −1**, care nu există în roadmap și e necesară: `SYN-P1-01` produce un build stricat,
deci orice altă undă poate fi invalidată de un deploy.

### Unda −1 — „Integritatea procesului" (nouă, nu există în roadmap)

**Ce conține:** rândurile **1, 2, 3** din tabelul principal.

**Ce deblochează:** **orice altă undă.** Un arbore deployat editat pe loc produce o
imagine care nu pornește, iar `restart: unless-stopped` o transformă în crash-loop. Un
suite de regresie care trece vacuum dă verde fals exact pe garda banilor.

**Efort:** **M** (3 zile-lucrătoare) — 1 cod + 1 cod + 1 operator.

**Criteriu de ieșire:**
> 1. Un build din sursa curentă pornește, toate containerele sunt `healthy`, și niciun
>    fișier din `/opt/blipmade/api/src` nu diferă de commitul build-at.
> 2. Suite-ul de plată **refuză** să ruleze dacă poarta de test Stripe e închisă.
> 3. `ss -ltnp` nu mai arată porturi de audit pe `0.0.0.0` și niciun proces nu mai are
>    `DATABASE_URL` către `blipmade` în mediu.

### Unda 0 — „Poate platforma să ia banii cuiva?"

**Ce conține:** rândurile **4 – 19** (rândul 20 partial).

**Ce deblochează:** prima tranzacție reală, prima factură reală, primul bilet real. Toate
celelalte unde depind de existența unui client care a plătit.

**Efort:** **M + M + M + S + M + M + S + S + S + S + S + S + M + S + S** ≈ **20 zile-lucrătoare**
(≈ 4 săptămâni calendar cu 2 persoane). **≈ 40% operator** (chei, conținut de ou, decizia
de TVA), **60% cod**.

**Criteriu de ieșire:**
> 1. Un client nou plătește **cu card real** și vede factura cu TVA vizibilă pe pagina lui.
> 2. Stripe arată `payment_intent` și `checkout.session` pentru aceeași comandă, în aceeași
>    sumă, cu aceeași perioadă.
> 3. Un cod de reducere care acoperă 100% produce **factură de 0** și **MRR neafectat**.
> 4. O comandă anulată, încercată din nou la checkout, e **respinsă** cu mesaj explicit.
> 5. `SELECT count(*) FROM "Product" WHERE deployable = true AND ("eggId" IS NULL OR "dockerImage" IS NULL)` → **0**.
> 6. Zero `Payment` cu `amount = 0 AND status = 'SUCCEEDED'`.

### Unda 1 — „Poate clientul să folosească ce a plătit?"

**Ce conține:** rândurile **20 – 23, 40 – 46**.

**Ce deblochează:** primul client care spune „funcționează" în loc de „am plătit și nu
merge". E exact feedback-ul care decide dacă platforma se repară sau se închide.

**Efort:** **S + M + M + M + S + S + M + M** ≈ **15 zile-lucrătoare** (≈ 3 săptămâni).

**Criteriu de ieșire:**
> 1. Un server provisionat primește o **adresă publică reală** care rezolvă DNS și răspunde,
>    verificabil din afara rețelei interne.
> 2. Un e-mail de confirmare de cont ajunge într-un **inbox** real, nu într-un fișier.
> 3. Un bilet cu fișier atașat ajunge la operator și fișierul **poate fi descărcat** de pe
>    server (`sha256` identic).
> 4. Dacă panoul devine inaccesibil, starea instanței devine **„degradată"**, nu „în
>    funcțiune" — reprodus manual o dată.
> 5. Clientul vede data de reînnoire a abonamentului, iar valoarea **nu e `null`**.

### Unda 2 — „Poate operatorul să o știe ruleze, s-o oprească și s-o repornească?"

**Ce conține:** rândurile **24 – 39, 47 – 59**.

**Ce deblochează:** onestitatea față de clientul care plătește lunar; **credibilitatea**
oricărei promisiuni de uptime. Fiecare euro încasat e altfel o promisiune de încredere fără
contrapartide.

**Efort:** **S + M + S + M + M + M + M + M + S + S + S + S + S + S + M + M + M + M + S + M + M + S + M + S + M + S + M + M** ≈ **42 zile-lucrătoare** (≈ 8 săptămâni calendar cu 2 persoane). **≈ 60% operator** — efortul e în infrastructură (edge, firewall, backup off-host, RAID), nu în cod.

**Criteriu de ieșire:**
> 1. Există o copie de backup **în afara gazdei**, criptată, cu drill de restaurare executat.
> 2. Din afara segmentului intern, porturile 111, 3128 și 8006 **nu răspund**.
> 3. Un `X-Forwarded-For` falsificat, trimis printr-un proxy de încredere, produce adresa
>    **reală** a clientului în jurnal și în cheia limitatorului.
> 4. 11 autentificări **reușite** consecutive → toate 200; un apelant neautentificat **nu**
>    poate bloca adresa unui administrator.
> 5. Un job eșuat e încă diagnosticabil după 30 de minute și apare într-un dead-letter.
> 6. Interogările Postgres peste 250 ms apar în jurnal.

### Unda 3 — „Poate afacerea să crească?"

**Ce conține:** rândurile **60 – 68, 71 – 73**.

**Ce deblochează:** platforma care nu se rupe la 10 000 de clienți, și integrarea care
aduce clienți de la distanță.

**Efort:** ≈ **26 zile-lucrătoare**.

**Criteriu de ieșire:**
> 1. Retragerea pe `/` e sub 200 KB.
> 2. Traseul de rețau pe `/` arată `GET /api/catalog/products` **o singură dată**.
> 3. Cotarea unui coș de 8 produse face ≤ 3 interogări.
> 4. Un client nou poate trece printr-un produs **gratuit**, fără card.
> 5. Un reseller poate citi serviciile și facturile unui client printr-o cheie API.

### Unda 4 — „De ce clientul alege Blipmade și nu un VPS sau un concurent?"

**Ce conține:** rândurile **69, 74, 75, 46, 39** (diferențiatorii și igiena vizibilă).

**Efort:** ≈ **12 zile-lucrătoare**.

**Criteriu de ieșire:**
> 1. Interfața e în română, iar sumele sunt formatate `ro-RO`.
> 2. Niciun produs din catalog nu e sub prețul unui VPS echivalent.
> 3. Fiecare client care pleacă are un **motiv** înregistrat.

### Rândul 76 — Igiena, documentația și cele `NOT VERIFIED`

**Ce conține:** rândul **76** din tabelul principal.

**De ce e separat:** 41 de constatări nu cer o reparare, ci **o metodă de verificare**
(`NOT VERIFIED`) sau o curățenie. Nu blochează nicio undă.

**Efort:** ≈ **8 zile-lucrătoare**, în total — nu într-o singură fază.

**Criteriu de ieșire:** fiecare dintre cele 5 constatări `NOT VERIFIED` (`FN-P1-16`,
`FN-P1-23`, `INFRA-P1-23`) primește o metodă de verificare documentată și un verdict;
restul e fie reparat, fie acceptat explicit ca „așa e, prin design".

### Efort total pe unde

| Unda | Efort | Zile-lucrătoare (S=1, M=3, L=8) | % operator |
|---|---|---|---|
| −1 — Integritatea procesului | M | 3 | 33 % |
| 0 — Poate lua banii | M×6 + S×8 | 20 | 40 % |
| 1 — Poate folosi ce a plătit | M×5 + S×3 | 15 | 20 % |
| 2 — Poate fi rulată | M×13 + S×15 | 42 | 60 % |
| 3 — Poate crește | M×6 + S×4 | 26 | 10 % |
| 4 — Diferențiator | M×4 | 12 | 25 % |
| — Igienă | M | 8 | 10 % |
| **Total** | — | **126 zile-lucrătoare** | **≈ 45 %** |

Cu **două persoane** în paralel, pe durate realiste: **≈ 13–16 săptămâni calendar** până
la ieșirea din unda 2. **Un singur dezvoltator** (fără resurse de operator paralele):
**≈ 6 luni**.

---

## 3. Calea critică — de la „nu se poate vinde" la „se poate vinde"

### 3.1 Numele lanțului

**„Lanțul primei tranzacții"** — cel mai scurt set de elemente care transformă
„platforma nu ia bani cuiva" în „platforma ia bani cuiva, și clientul vede ce a plătit".

### 3.2 Lanțul, în ordine

| # | Rând | Ce face | Efort | Cine |
|---|---|---|---|---|
| 1 | **4** | `STRIPE_SECRET_KEY` + `PAYMENTS_ENABLED=true` + webhook | S | operator |
| 2 | **5** | Produs vândabil: imagine reală + ou mapat + produs de joc în catalog | M | operator + cod |
| 3 | **6** | `DOMAIN_BASE` + Caddy → instanța primește adresă publică | S | operator |
| 4 | **7** | `SMTP_URL` + transport `smtp` → e-mailurile ajung | S | operator |
| 5 | **20** | `checkout` e citit de pagina de facturare → clientul vede starea plății | S | cod |
| 6 | **8** | Factura e emisă și afișată după plată | M | cod |
| 7 | **9** | TVA: rată, bază, total | M | operator (decizie) + cod |

### 3.3 Efortul lanțului

| | |
|---|---|
| **Efort total al lanțului** | **S + M + S + S + S + M + M = 17 zile-lucrătoare** |
| **Efort operator** | **5 zile-lucrătoare** (rândurile 1, 3, 4 + decizia de TVA din 7) |
| **Efort cod** | **12 zile-lucrătoare** (rândurile 2, 5, 6, 7) |
| **Calendar realist** | **≈ 2 săptămâni cu 2 persoane** (operatorul și dezvoltatorul în paralel) |
| **Cel mai lung blocaj** | rândul **2** — imaginea și oul produsului: **conținut, nu cod** |

### 3.4 De ce acest lanț și nu altul

- **Fiecare element e strict necesar.** Fără 1 nu se plătește. Fără 2 nu se livrează. Fără
  3 produsul nu are adresă. Fără 4 nu se poate confirma niciun flux. Fără 6 și 7, clientul
  plătește și nu primește factură — deci **nu plătește a doua oară**.
- **Nu conține elemente care pot fi întârziate fără pierdere.** Contrastul, antetul
  lipicios, 2FA, API-ul public, planul free — toate sunt utile, dar niciunul nu stă
  între „nu se poate vinde" și „se poate vinde".
- **Efortul e dominat de operator, nu de cod.** 5 din 17 zile sunt operator. Asta e
  constatarea centrală a acestei runde: **nu dezvoltarea e blocajul, e pornirea.**

### 3.5 Ce se întâmplă dacă se sare peste un element

| Sarea peste | Ce se întâmplă |
|---|---|
| 1 (cheile Stripe) | Zero venit. Nimic din rest nu e testabil cu un client real. |
| 2 (imaginea + oul) | Clientul plătește și primește un „Hello world" care răspunde 200 pe `/health`. Rambursare + recenzie negativă. |
| 3 (adresa publică) | Server de joc fără adresă = produs inexistent. |
| 4 (SMTP) | Nimic nu ajunge: cont, factură, bilet, resetare de parolă. Suportul e un canal mort. |
| 6 (factura) | Clientul plătește și nu primește factură. În UE, o firmă nu plătește. |
| 7 (TVA) | Factura nu e deductibilă. Pe piața RO e condiție de plată la clienți de business. |

---

## 4. Ce este explicit în afara scopului următoarelor 30 de zile

| ID-uri | Ce | De ce e în afara scopului | Când devine relevant |
|---|---|---|---|
| `PAR-P1-34` | Temă, extensie, CLI, punct de extensie | **Decizie de arhitectură, nu defect.** Fiecare funcție nouă se scrie în nucleu; devine problemă când echipa crește, nu în următoarele 30 de zile | Când echipa are > 3 developeri |
| `COMP-P1-08`, `COMP-P1-15`, `PAR-P1-14` (parțial) | Segmentul reseller (S3) | **Decizie de segment.** Raportul competitiv spune explicit „nu se acționează acum; S3 nu e ținta". API-ul public rămâne util pentru integrare internă, dar nu se construiește un multi-tenant | După ce segmentul S1/S2 e servit |
| `PAR-P1-21` | Programul de afiliați | Blochează **creșterea**, nu vânzarea. Și e dependent de canalele de marketing, care nu există încă | Când există primele 100 de clienți |
| `PAR-P1-32`, `COMP-P1-18`, `PAR-P1-13` | Plan free, planuri de unică folosință | Conversie fără card, dar un plan free consumă resurse reale și impune o decizie de cost. Nu blochează vânzarea — **1,49 €/lună există** | Când MRR-ul acoperă costul resurselor gratuite |
| `PAR-P1-30` | Motiv de anulare + credit de cont | Măsurarea churn-ului. Nimeni nu pleacă încă de la un client care n-a plătit niciodată | După primele 50 de clienți plătitori |
| `COMP-P1-10` | Recenzii, referințe, dovezi publice | **Imposibil** înainte de `COMP-P1-01` și `COMP-P1-02`. Nu se poate cere unui client să scrie o recenzie despre un produs care nu există | După primele 10–20 de clienți reali |
| `COMP-P1-16` | SLA și țintă publică de uptime | Promisiunea trebuie să fie **credibilă** — depinde de `INFRA-P1-12` (monitorizare) și `INFRA-P1-01` (backup off-host) | După ce unda 2 e închisă |
| `COMP-P1-04` | Protecție DDoS | **Nu e o decizie de cod**, e una de edge, și implică cost. Dar e criteriu de eliminare înaintea prețului, deci e începută în unda 2 prin planificare | Edge VM 102 — buget și furnizor |
| `PERF-P1-21` | Cache la margine pentru activele statice | E dependent de edge; compresia din `PERF-P1-01` aduce 65–71% din câștig pentru o zecime din efort | După `PERF-P1-01` |
| `FN-P1-23`, `FN-P1-25`, `FN-P1-16` | Funcții care depind de panou, DNS real, plata unui upgrade | Necesită acces la panoul real și la DNS real. Nu se pot verifica în sandbox | Când panoul și DNS-ul sunt accesibile |
| `SEC-P4-02`, `SEC-P4-03`, `INFRA-P1-20` | CSP, HSTS, retenția joburilor eșuate | **Falsuri pe lista de „GO blockers"**: `CSP` e o slăbiciune, nu o apărare lipsă; retenția joburilor e deja acoperită de `PAR-P1-25` | La următoarea revizie de hardening |
| Toate cele `Low-Info` din rândul 76 | Igienă, documentație, aliasuri de rute, capete moarte | Nu blochează nicio undă. **Se fac când e timp** | Când undele critice sunt închise |
| `INFRA-P1-22` | Patch-uri OS în așteptare | O actualizare de securitate, fără impact măsurat asupra platformei | La următoarea fereastră de mentenanță |
| `FIN-P3-01`, `FIN-P3-02`, `FIN-P3-03` | Read-modify-write pe retenție, constrângeri `CHECK` în baza de date, numere arse | Fereastra e mică (proces unic) și impactul e redus. `FIN-P3-02` e **întărire**, nu defect | După ce rata de scriere crește |

---

## 5. „În ce ordine se lucrează, dacă nu ai decât o zi"

### 5.1 Cel mai valoros element

**Rândul 4 — `STRIPE_SECRET_KEY` + `PAYMENTS_ENABLED=true` + webhook configurat.**

Un singur rând, efort **S** (o oră, poate mai puțin), care schimbă **întregul statut al
platformei**: din „zero venit" în „poate lua bani". Nu există alt rând din toate cele 212
cu un raport valoare/efort mai bun. Toate celelalte 211 rânduri sunt sub el ca
importanță *până în momentul în care e închis*, pentru că până atunci niciunul nu poate fi
validat de un client real.

**Dacă ai o oră și un singur lucru de făcut, fă-l pe acesta.** În paralel — și doar dacă
mai ai timp — **rândul 1** (`SYN-P1-01`): fără el, rândul 4 poate fi stricat de următorul
deploy.

### 5.2 Cel mai riscant element

**Rândul 2 — produsul vândabil: imagine reală + ou mapat + produs de joc în catalog.**

Nu pentru că e greu (efort **M**), ci pentru că **e singurul rând din toată lista unde un
eșec nu se vede imediat și costă cel mai mult**:

- Dacă imaginea e greșită sau oul e mapat greșit, clientul plătește și primește ceva
  care nu funcționează. Platforma nu se prăbușește — **își pierde reputația**, care la o
  platformă nouă e cel mai scump lucru de cumpărat.
- E dependent de conținut, nu de cod: **nu se poate scrie în sprint**. Depinde de
  operator, de panou, de timpul de instalare a imaginii.
- E greu de reversat: un `Hello world` livrat unui client plătitor produce un bilet, o
  recenzie negativă, un refund și un `chargeback` — iar `DISPUTE` la Stripe e mult mai
  lent de reparat decât un cod.

**Regula care rezultă:** nu se deschide checkout-ul public până când produsul livrat
**nu** e un starter generic. Altfel se plătește pentru ceva care nu e ce s-a vândut.

### 5.3 Dacă ai o zi, în ordine de minute

| Minute | Ce | De ce |
|---|---|---|
| 0–10 | Verifică starea lui `SYN-P1-01`: compară `md5sum` pe `src/` cu arborele de referință | Dacă arborele deployat e din nou în editare, **nu deblocăm nimic** |
| 10–25 | Trimite sau pregătește cererea pentru cheile Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`) | Rândul 4: cel mai mare câștig pe oră din toată lista |
| 25–45 | Trimite sau pregătește `SMTP_URL` | Rândul 7: al doilea cel mai mare câștig, tot efort **S** |
| 45–55 | Trimite sau pregătește `DOMAIN_BASE` + acces la Caddy | Rândul 6: tot efort **S**, și e în lanțul critic |
| 55–60 | Scrie, pe un post-it: „backup: `OFFSITE_TARGET` + `OFFSITE_KEY` + `rclone`" | Rândul 29: singurul rând **Critical** cu efort **S** de operator |

---

## 6. Doar operatorul poate debloca

Fiecare rând are **acțiunea exactă** și **numele exact al variabilei**. Aceasta e lista
pe care operatorul o acționează — și, în ordine, **șase dintre primele zece rânduri din
tabelul principal nu se pot face fără ea**.

### 6.1 Variabile de mediu

| # | Rând | Variabila / acțiunea exactă | Unde | Ce deblochează | Sev |
|---|---|---|---|---|---|
| 1 | 4 | `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `PAYMENTS_ENABLED=true` | `.env` de producție | **Încasarea banilor** | P0 |
| 2 | 7 | `SMTP_URL` + transport `smtp` | `.env`; `api/src/lib/mailer.ts` | **Orice comunicare cu clientul** | P0 |
| 3 | 6 | `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` | `.env`; edge VM 102 | **Adresa publică a instanței** | P0 |
| 4 | 29 | `OFFSITE_TARGET`, `OFFSITE_KEY` + instalarea lui `rclone` | `.env`; `scripts/backup-offsite.sh` | **Copia care iese din gazdă** | Critical |
| 5 | 25 | `TRUSTED_PROXIES` (doar bridge-ul Docker) | `compose.api.yml`; `.env` | **Limitarea reală per client** | High |
| 6 | 64 | `log_min_duration_statement = 250ms` | `compose.api.yml` (Postgres) | **Observabilitatea interogărilor** | High |
| 7 | 30 | RAID 1 pe `/` | Proxmox | **Pervioarea single-disk** | Critical |
| 8 | 49 | `archive_mode=on`, `wal_level=replica` + arhivare WAL | Postgres | **PITR** | High |
| 9 | 31 | Firewall: `22`, `111`, `8006`, `3128` → private | Proxmox | **Perimetrul închis** | Critical |
| 10 | 51 | Registru de imagini cu digest + cale de rollback | infrastructură | **Rollback** | Medium |
| 11 | 47 | Agent de monitorizare + releu de alerte | gazdă | **Detectarea incidentelor** | Medium |
| 12 | 65 | Swap pe gazdă | host | **Amortizorul de memorie** | High |
| 13 | 9 | Decizie: rată TVA, bază (net / TVA-inclus), tratament B2B | operator | **Factură deductibilă** | P0 |
| 14 | 75 | Decizie: plafon de RAM la 6 GB pentru produsul de joc | operator | **Prețul sub plafonul VPS** | High |
| 15 | 72 | Decizie: planurile de vândut (free? one-time? interval?) | operator | **Pragul de intrare** | Medium |
| 16 | 5 | Imagine Docker reală + ou mapat per produs, `eggId` real | panou Pterodactyl | **Livrarea produsului vândut** | P0 |
| 17 | 21 | Acces la panou (read-only e suficient) | panou | **Stările reale ale instanței** | High |
| 18 | 33 | Generarea secretelor proprii pentru stack-ul de test | infrastructură | **Izolarea testelor** | Medium |

### 6.2 Acțiuni de host, fără variabilă

| # | Rând | Acțiunea exactă | Sev |
|---|---|---|---|
| 19 | 3 | Oprirea stack-urilor de audit de pe `0.0.0.0` (30003, 30004, 30005, 3112, 3113) și a PID 46931/46943 | Medium |
| 20 | 31 | `INPUT DROP` + `FORWARD DROP` pe VM, cu excepții explicit documentate | Critical |
| 21 | 65 | `swap` activat pe gazdă | High |
| 22 | 30 | Verificarea mirroring-ului la nivel de hipervisor | Critical |
| 23 | 3 | `LLMNR` limitat la `127.0.0.1` | Low |
| 24 | 69 | `INFRA-P1-17`: ștergerea celor 6 baze de test rămase + a celor 7 099 de e-mailuri nedeliverate | Medium |
| 25 | 54 | Instalarea unui releu de alerte | Medium |

### 6.3 Dependențe de terț

| # | Rând | Dependența | Ce blochează | Sev |
|---|---|---|---|---|
| 26 | 5 | Panou Pterodactyl — ou, imagine, mapare `eggId` | Livrarea produsului | P0 |
| 27 | 6 | Edge Caddy (VM 102) — credențiale admin | Adresa publică | P0 |
| 28 | 4 | Stripe — cont live + webhook endpoint | Încadrarea banilor | P0 |
| 29 | 7 | Furnizor SMTP — credențiale | Livrarea e-mailului | P0 |
| 30 | 75 | Contextul de piață — prețurile concurenților | Poziționarea de preț | High |

### 6.4 Cheltuieli recurente pe care le asumă operatorul

Nu sunt „constatări", dar **blochează** câte un rând din tabel și nu apar în niciun raport
de audit:

| Cheltuială | Ce deblochează | De ce nu se poate evita |
|---|---|---|
| **Stocare off-host** | rândul 29 | Backupul care iese din gazdă trebuie să ajungă undeva. Cu RAID 0, „tot pe același hipervisor" nu e backup |
| **Filtru DDoS la edge** | `COMP-P1-04` | Toți concurenții din set îl includ; Aternos îl dă gratuit |
| **Backup-ul RAID 1** | rândul 30 | Un mirror pe același hipervisor nu reduce expunerea la `193.34.214.20` |
| **Conturi Stripe cu fond real** | rândul 4 | `chargeback`-urile și rezervele de lichiditate au un cost |

---

*Backlog încheiat la 2026-10-24, faza 12. Documentul nu conține constatări noi — toate
cele 212 provin din `NEW-FINDINGS.md`, unde fiecare are sursa și dovada. Aici sunt doar
acțiunile, ordinea și efortul.*
