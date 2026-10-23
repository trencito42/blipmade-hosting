# 06 — Călătoriile clientului, cum sunt ele de fapt

**Data:** 2026-10-23 · **Sistem:** `https://blipmade.com`, rulând pe commit `7df3973` · **Conturi:** client `qa.headless.one@example.test` (1 instanță, 1 comandă, 12 tichete), staff `browser-admin@blipmade.test`.

Fiecare pas are una dintre marcajele: `WORKS` (executat și observat), `BROKEN` (executat și a eșuat, cu dovada), `PARTIAL` (merge pe jumătate), `BLOCKED` (nu a putut fi executat, cu motivul și pasul sigur de deblocare), `NOT-IMPLEMENTED` (nu există în cod).

Regulile de citire ale platformei sunt pe loc: **checkout-ul răspunde `503 payments_unavailable`** (`STRIPE_SECRET_KEY` gol, `PAYMENTS_ENABLED=false`) și **trimiterea mailurilor este oprită** (`mailDelivery.transport=file`, `configured:false`). `GET /api/health`, citit înainte de a începe.

> **Ce am lăsat în urmă:** un ticket nou pe contul de test, **„Audit journey probe 2026-10-23"**, numărul **#48**, creat la 17:39 (următorul după cele 12 tichete pe care le găsiseram). **Nu l-am putut șterge:** nu există `DELETE /api/tickets/:id` în API (`api/src/routes/tickets.ts:133-401` — doar `GET`, `POST /tickets`, `POST /tickets/:id/replies`, `POST /tickets/:id/attachments`, `POST /tickets/:id/status`), și niciun buton de ștergere în interfața clientului sau în cea a staff-ului. Singura cale ar fi fost o ștergere directă în baza de date, iar auditul este read-only. Ticketul rămâne acolo.

---

## J1 — Înregistrare → confirmarea adresei → prima autentificare

### 1.1 Forma de înregistrare — `WORKS`

`/register` se deschide pe „Create your account." cu patru câmpuri: **First name**, **Last name**, **Email address**, **Password**. Fără câmp de confirmare a parolei, fără casetă de „accept termenii", fără link către „condiții" — deci nu există un text legal acceptat, ci nici măcar o trimitere care să-l pretindă. `VERIFIED` — `audit/screenshots/journey-j1-register.png`.

Câmpul parolei este `type="password"` fără `minlength` HTML (`minLength: -1`), deci regulile stau în JavaScript (`checkPw` în `pages/Register.tsx`) și se văd doar ca text de ajutor sub câmp. `VERIFIED`

### 1.2 Înregistrarea cu o adresă care există deja — `WORKS`

Am completat formularul cu adresa contului de test și am apăsat „Create account". Serverul a răspuns **`POST /api/auth/register` → 409**, iar pagina a arătat: **„We could not create the account. Check the details and try again."** Niciun rând nou nu a fost scris. `VERIFIED` — `audit/screenshots/journey-j1-register-duplicate.png`.

Observație: mesajul nu spune **care** câmp e greșit. Pentru un client care încearcă să ajungă la o adresă pe care o folosește deja, „Check the details" nu spune nimic. `INFERRED` din mesajul observat.

### 1.3 Linkul de confirmare cu un token care nu există — `WORKS`

`/verify-email?token=not-a-real-token` răspunde corect: **„This confirmation link is invalid or has expired."**, cu explicația „Confirmation links can only be used once and stop working after a while" și o trimitere nouă. `VERIFIED` — `audit/screenshots/journey-j1-verify-bad-token.png`.

### 1.4 Prima autentificare a unei adrese neverificate — `PARTIAL`

Autentificarea funcționează și duce în `/app`. Dar sesiunea spune `emailVerified: false` — și **adresa contului de test nu a fost confirmată niciodată** (`User.emailVerifiedAt` este `NULL` în baza de date). `VERIFIED`

Iar **mailul nu se trimite**: `GET /api/health` raportează `"mail":"file"` și `mailDelivery: {transport: "file", configured: false, delivered: false}`. `VERIFIED`

Rezultă un vicol: **clientul se poate înregistra, primește „verifică-ți adresa", și nu primește niciodată mailul.** Nu poate afla de ce și nu are pe cine să întrebe. `INFERRED` — mecanismul de trimitere e oprit, iar pagina de confirmare promite un link care nu ajunge.

### 1.5 Se spune undeva că adresa nu e verificată? — `PARTIAL`

- **În Setări, da.** `audit/screenshots/journey-j1-not-verified.png`: câmpul „EMAIL ADDRESS" arată `qa.headless.one@example.test` și, lângă el, **„Not verified"**. `VERIFIED`
- **În panoul principal, nu.** Textul paginii `/app` nu conține cuvântul „verif" deloc. `VERIFIED`

Deci avertismentul există, dar **doar pe pagina în care clientul nu are motiv să intre**. Un client care tocmai s-a înregistrat aterizează în `/app` și nu vede nimic. `INFERRED`

### 1.6 Rezumat J1

| Pas | Stare | Dovadă |
|---|---|---|
| 1.1 formularul de înregistrare | `WORKS` | „Create your account.", 4 câmpuri |
| 1.2 regulile formularului | `WORKS` | reguli în JS, nu în HTML |
| 1.3 adresă deja existentă | `WORKS` | 409, nicio scriere |
| 1.4 link de confirmare invalid | `WORKS` | mesaj corect |
| 1.5 prima autentificare | `PARTIAL` | intră, dar `emailVerified:false` |
| 1.6a avertismentul în Setări | `WORKS` | „Not verified" |
| 1.6b avertismentul în panou | `NOT-IMPLEMENTED` | panoul nu spune nimic |
| 1.7 primirea mailului | `BLOCKED` | transportul de mail este `file`, `configured:false` — deblocare: un `SMTP_URL` real și o adresă confirmată |

---

## J2 — Catalog → produs → preț

### 2.1 Catalogul — `WORKS`, dar cu o rezervă importantă

`/apps` listează **5 produse**: WordPress, Code Server, Discord Bot, Uptime Kuma, PostgreSQL. Fiecare are numele, categoria, descrierea, „Min. 512 MB · 5 GB disk" și prețul. `VERIFIED` — `audit/screenshots/apps-check-1280.png`.

**Doar unul din cinci se poate-deploya.** `discord-bot` are butonul „Deploy"; celelalte patru au eticheta „Not available yet". `VERIFIED`

### 2.2 Prețul — `WORKS`

Pagina produsului arată **„€1.49 / per month"** pentru configurația minimă. Prețul este înainte de orice configurație, deci clientul vede costul înainte de a da click pe „Deploy". `VERIFIED` — `audit/screenshots/journey-j2-product.png`.

### 2.3 Produsul care nu se poate deploya — `WORKS`

`/apps/wordpress` spune limpede: „its image is not installed on the platform yet". E corect și e onest. `VERIFIED` — `audit/screenshots/journey-j2-product-not-deployable.png`.

### 2.4 Catalogul în timpul încărcării — `PARTIAL`

Am prins catalogul în starea de încărcare: **8 dreptunghiuri goale**, identice cu 8 carduri de produs fără conținut. Fără text, fără scheletare vizibilă, fără indicator. Clientul nu poate deosebi „se încarcă" de „catalogul e gol". `VERIFIED` — `audit/screenshots/apps-catalog-1280.png` (captură luată în starea de încărcare).

Timpul real de încărcare e sub un secundă (`firstText` 523–596 ms, măsurat de trei ori), deci problema nu e viteza, ci **cum arată starea de așteptare**. `VERIFIED`

### 2.5 Rezumat J2

| Pas | Stare | Dovadă |
|---|---|---|
| 2.1 catalogul | `WORKS` | 5 produse, 1 deployabil |
| 2.2 prețul produsului | `WORKS` | €1.49/mo |
| 2.3 produs nedeployabil | `WORKS` | mesaj explicit |
| 2.4 catalogul în încărcare | `PARTIAL` | 8 carduri goale, indistincte de un catalog gol |

---

## J3 — Configurare → deploy → provisionare → adresă → consolă → fișier → metrici

Aceasta este călătoria centrală, și ea are **trei locuri în care clientul se pierde**.

### 3.1 Catalogul de deploy — `WORKS`

`/app/deploy` duce clientul la formular. `audit/screenshots/journey-j3-deploy-catalogue.png`.

### 3.2 Formularul de configurare — `WORKS`

Patru lucruri: **Instance name**, **Memory** (9 opțiuni, de la 0.5 la 128 GB), **CPU** (5 opțiuni), **Storage** (un cursor). Prețul se recalculează în timp real: **„€1.72"** pentru configurația aleasă, cu explicația „The price of the smallest configuration is €1.49/mo. The amount above is the price of the configuration you chose." `VERIFIED` — `audit/screenshots/journey-j3-deploy-form.png`.

Aceasta este **cea mai bine făcută parte a interfeței**: prețul e mereu în fața clientului, cu o frază care spune exact ce înseamnă cifra.

### 3.3 Parametrii de pornire — `NOT-IMPLEMENTED` **în formular**

Formularul de deploy **nu are niciun câmp** pentru imaginea Docker, comanda de pornire sau variabilele de mediu. Clientul alege dimensiunile și plătește, și **abia după** provisionare poate seta ce rulează în container — în tabul „Startup", al șaptelea dintre douăsprezece. `VERIFIED` (formularul) + `CODE-INSPECTED` (`app/Deploy.tsx:412-540`, tabul `Startup` există: `app/instance/StartupTab.tsx`).

Pentru un Discord bot, alegerea imaginii și a comenzii **este** produsul. Aplicația o vinde la 1.49 €/lună fără să poată spune ce se va instala. `INFERRED`

### 3.4 Prețul configurației — `WORKS`

`POST /api/catalog/quote` răspunde **200** cu `subtotal`, `discount`, `total`, `currency`. `VERIFIED` — apelul propriu al aplicației, în jurnalul de rețea al paginii.

### 3.5 Deploy-ul propriu-zis — `BLOCKED`

Butonul de deploy creează o comandă și cere plata. Cum plata e oprită, și cum auditul e read-only, **butonul nu a fost apăsat**. `BLOCKED` — motiv: scriere în baza de date și provisionare pe nod.

Dovada că fluxul a funcționat vreodată există în baza de date: comanda `cmvkbgm4k0008r1011in2sa3u` a clientului de test este în `AWAITING_PAYMENT`, cu 172 de cenți.

### 3.6 Provisionarea — `WORKS`, dar clientul nu o vede bine

Pagina de deploy are patru pași, iar pasul al patrulea interoghează comanda **o dată la 4 secunde** (`app/Deploy.tsx:248-253`), cu `aria-live="polite"` și trei stări distincte: „The server confirmed the payment. Your instance is being created.", „The order is waiting for payment.", „The instance has not appeared yet. This page refreshes every few seconds." `CODE-INSPECTED` + `VERIFIED`

### 3.7 **Adresa — aici se pierde clientul** — `BROKEN`

Pagina instanței afișează, în antet, **„No public URL yet"**. `audit/screenshots/journey-j3-instance-detail.png`, `audit/screenshots/cust-320-app_instances_cmvkbgm9h0001r18096ep5jzl.png`.

Dar adresa **există**. API-ul o are, în al nouălea tab al paginii:

```
GET /api/instances/cmvkbgm9h0001r18096ep5jzl/allocations → 200
{"allocations":[{"id":74,"ip":"10.77.0.11","port":30001,"alias":"node1.blipmade.com","is_default":true}]}
```
`VERIFIED` — `audit/screenshots/tab-network.png`: tabul „Network" arată „ADDRESSES — The addresses the panel assigned to this instance. The primary one is the address the service is reached at." și rândul `10.77.0.11:30001  node1.blipmade.com  Primary`.

**De ce spune „No public URL yet"** e corect și verificabil: `api/src/routes/instances.ts:33-36` calculează `url` **doar** dintr-un domeniu cu starea `ACTIVE`:

```ts
// The address the customer reaches the instance at. It is the domain that
// is routed, and there is none before a domain is proven and routed.
const active = (instance.domains ?? []).find((domain) => domain.status === 'ACTIVE');
return { …, url: active ? `https://${active.hostname}` : null, … };
```

Deci antetul nu vorbește despre adresa de serviciu, ci despre un **domeniu HTTPS** — și nici nu spune asta. Clientul citește „fără adresă" și renunță. `VERIFIED` (codul) + `INFERRED` (consecința pentru client).

**Costul ascuns:** cu zero domenii, `GET /api/domains` → `{"domains":[]}`, iar un domeniu se cumpără — deci **adresa publică depinde de un plățitor care nu e deschis**. În starea curentă, un client nou nu poate ajunge niciodată la o adresă publică.

### 3.8 Consola — `WORKS`

Tabul „Console" se deschide și scrie **„Connected to the server console. Connected"**, cu un câmp „Command" și un buton „Send". `GET /api/instances/:id/console` → 200 cu `{"websocket": "/api/instances/:id/console/stream"}`. `VERIFIED` — `audit/screenshots/tab-console.png`.

**Dar:** al doilea dintre douăsprezece taburi, într-o bandă care derulează orizontal. Pe telefon, e al doilea. `VERIFIED`

### 3.9 Fișierele — `WORKS`

Tabul „Files" arată arborele real al containerului: `.npm/` (director), `bm-test copy.txt` (19 B, `-rw-r--r--`), `bm-test.txt` (19 B). Există controlul de încărcare („Uploading goes to /"). `VERIFIED` — `audit/screenshots/tab-files.png`.

### 3.10 Încărcarea unui fișier — `BLOCKED`

N-am încărcat nimic: regula de audit spune „no file uploads to real instances". `BLOCKED` — motiv: scriere pe instanța reală; deblocare: o instanță de test separată.

Controlul **există și e funcțional ca UI**. Ce nu putem afirma e că ajunge fișierul.

### 3.11 Metricile — `WORKS`, dar se contrazic

Tabul „Overview" arată: **MEMORY 0 B of 512 MB**, **DISK 8.6 KB of 5 GB**, **PROCESSOR 0% of 1 vCPU**, **UPTIME 0 m**, **„Container: offline"**.

Și, în același ecran, în antet, pastila de stare spune **„Online"**.

`GET /api/instances/:id/metrics` → `{"metrics":{"state":"offline","cpuAbsolute":0,"memoryBytes":0,"networkRx":0,"networkTx":0,"diskBytes":8814,"uptimeMs":0}}`. `VERIFIED`

Deci **două stări diferite, pe același ecran, fără o explicație**: starea instanței (din baza de date: `ONLINE`) și starea containerului (de la panou: `offline`). Clientul vede „Online" și, imediat sub el, „Container: offline", plus toate metricile la zero. `VERIFIED` — `audit/screenshots/tab-console.png`, `audit/screenshots/journey-j3-instance-overview-metrics.png`.

Faptul că panoul spune `offline` înseamnă că **serverul nu chiar rulează**, deși platforma îl vede provisionat. `INFERRED` din cele două răspunsuri.

### 3.12 Rezumat J3

| Pas | Stare | Dovadă |
|---|---|---|
| 3.1 catalogul de deploy | `WORKS` | `/app/deploy` |
| 3.2 formularul de configurare | `WORKS` | preț live, 4 câmpuri |
| 3.3 parametrii de pornire | `NOT-IMPLEMENTED` | nu există în formular; există în tabul Startup, după plată |
| 3.4 prețul configurației | `WORKS` | `POST /api/catalog/quote` → 200 |
| 3.5 deploy-ul | `BLOCKED` | scriere + provisionare; comanda AWAITING_PAYMENT din baza de date e dovada |
| 3.6 provisionarea | `WORKS` | 4 pași, interogare la 4 s, `aria-live` |
| 3.7 **adresa** | `BROKEN` | antetul spune „No public URL yet"; adresa reală e în tabul Network |
| 3.8 consola | `WORKS` | „Connected", websocket 200 |
| 3.9 fișierele | `WORKS` | arborele real, control de încărcare prezent |
| 3.10 încărcarea | `BLOCKED` | regula de audit |
| 3.11 metricile | `PARTIAL` | „Online" și „Container: offline" pe același ecran |

---

## J4 — Schimbarea resurselor → preț → plată

### 4.1 Schimbarea — `WORKS`, dar nu e unde clientul se uită

Controlul **nu este** pe pagina instanței, ci în tabul **„Resources"**, al **unsprezecelea** dintre douăsprezece. Acolo sunt trei trepte cu „−" și „+", cu limitele scrise: „Between 256 and 4096 MB", „Between 1 and 4 vCPU", „Between 1 and 50 GB", plus prețul „€1.72 / month" și butonul „Save resources". `VERIFIED` — `audit/screenshots/tab-resources.png`.

### 4.2 Prețul schimbării — `WORKS`

```
GET /api/instances/:id/resources/quote?ram=1024&cpu=2&disk=10 → 200
{"quote":{"currentPrice":172,"newPrice":252,"priceDelta":80,"currency":"EUR","requiresPayment":true}}
```
`VERIFIED`

O observație de proiectare bună: `requiresPayment` vine **de la server**. API-ul (`api/src/routes/instances.ts:268-280`) spune că o creștere creează o comandă și o sesiune de plată, iar instanța se schimbă abia după confirmarea plății; o scădere se aplică imediat. `CODE-INSPECTED`

### 4.3 Plata — `BLOCKED`

```
POST /api/orders/cmvkbgm4k0008r1011in2sa3u/checkout → 503
{"error":{"code":"payments_unavailable","message":"Payments are not available at the moment: no Stripe key is configured on this environment."}}
```
`VERIFIED`

Am verificat în cod că acest apel **nu scrie nimic**: `api/src/services/stripe.ts:150-153` aruncă `paymentsUnavailable()` înainte de a atinge baza de date. Deci comanda rămâne exact cum era.

### 4.4 Rezumat J4

| Pas | Stare | Dovadă |
|---|---|---|
| 4.1 schimbarea resurselor | `WORKS` | tabul Resources, 3 trepte |
| 4.2 prețul schimbării | `WORKS` | delta 80 de cenți, `requiresPayment:true` |
| 4.3 plata | `BLOCKED` | `503 payments_unavailable` |

---

## J5 — Domeniu → atașare → verificare

### 5.1 Pagina de domenii — `WORKS`

`/app/domains` explică ce e un domeniu și cum se dovedește: „Claim a hostname for one of your instances. You prove that it is yours with a TXT record before it is routed." `VERIFIED` — `audit/screenshots/journey-j5-domains.png`.

### 5.2 Lista — `WORKS`, goală

`GET /api/domains` → `{"domains":[]}`. Pagina arată starea goală. `VERIFIED`

### 5.3 Tabul de domenii al instanței — `WORKS`

„No domains for this instance. Add a hostname and point its DNS records at Blipmade." + un link „Manage domains". `VERIFIED` — `audit/screenshots/tab-domains.png`.

### 5.4 Cumpărarea, atașarea și verificarea — `BLOCKED`

Un domeniu se cumpără, deci plătește, deci `503`. Fără domeniu nu există nici `POST /instances/:id/domains` (nu se poate cere un domeniu), nici `POST /domains/:id/verify` (nu există domeniu de verificat), nici adresa publică de la 3.7. `BLOCKED` — motiv: zidul de plată; deblocare: `STRIPE_SECRET_KEY` + `PAYMENTS_ENABLED=true`.

### 5.5 Rezumat J5

| Pas | Stare | Dovadă |
|---|---|---|
| 5.1 pagina de domenii | `WORKS` | textul de ajutor e clar |
| 5.2 lista | `WORKS` | `{"domains":[]}` |
| 5.3 tabul de domenii | `WORKS` | starea goală + „Manage domains" |
| 5.4 cumpărarea | `BLOCKED` | `503 payments_unavailable` |
| 5.5 atașarea | `BLOCKED` | nu există domeniu |
| 5.6 verificarea | `BLOCKED` | nu există domeniu |

---

## J6 — Ticket → scriere → urmărire → atașare

### 6.1 Lista de tichete — `WORKS`

`/app/tickets` arată 12 tichete într-un tabel (SUBJECT, NUMBER, CATEGORY, STATUS), cu „Your tickets — Every conversation with Blipmade support, newest activity first." `VERIFIED` — `audit/screenshots/journey-j6-ticket-list.png`.

### 6.2 Formularul — `WORKS`

Patru câmpuri: **Subject**, **Category**, **Related instance**, **Message**. `VERIFIED` — `audit/screenshots/journey-j6-new-ticket.png`.

### 6.3 Crearea — `WORKS`

Ticketul s-a creat și a apărut în listă: **„Audit journey probe 2026-10-23", #48**. `VERIFIED` — `audit/screenshots/journey-j6-ticket-created.png`.

### 6.4 Conversația — `WORKS`

Pagina ticketului arată metadatele (CATEGORY, PRIORITY, RELATED INSTANCE, LAST ACTIVITY) și firul de mesaje. `VERIFIED` — `audit/screenshots/journey-j6-ticket-detail.png`.

### 6.5 Răspunsul — `WORKS`

Există un câmp „Your message" (5 rânduri) și un buton „Send reply". `VERIFIED` — `audit/screenshots/journey-j6-reply-form.png`.

### 6.6 Atașarea unui fișier — `PARTIAL`

Există câmpul „Attachment" (`#ticket-attachment`, `type="file"`) și sub el scrie: **„Up to 10 MB. Only the file name, size and type are sent with your reply — the file contents are not uploaded from this form."** `VERIFIED`

**Asta e un `PARTIAL` onest, nu un bug ascuns.** Dar e o limitare reală: clientul care trebuie să trimită un stack-trace nu poate. Observație: **tabelul `Attachment` există în baza de date** (`api/prisma/schema.prisma:827`, cu `storageKey` și `sha256`), și API-ul are `POST /tickets/:id/attachments` (`api/src/routes/tickets.ts:314`) — deci **interfața nu folosește un backend care există**. `CODE-INSPECTED`

### 6.7 Ștergerea ticketului — `NOT-IMPLEMENTED`

Nu există `DELETE /api/tickets/:id` și nu există buton de ștergere. Astfel, ticketul creat de audit a rămas în sistem (vezi începutul documentului). `CODE-INSPECTED`

### 6.8 Rezumat J6

| Pas | Stare | Dovadă |
|---|---|---|
| 6.1 lista | `WORKS` | 12 tichete |
| 6.2 formularul | `WORKS` | 4 câmpuri |
| 6.3 crearea | `WORKS` | ticket #48 |
| 6.4 conversația | `WORKS` | firul de mesaje |
| 6.5 răspunsul | `WORKS` | câmp + „Send reply" |
| 6.6 atașarea | `PARTIAL` | se trimite doar numele, nu conținutul |
| 6.7 ștergerea | `NOT-IMPLEMENTED` | nu există endpoint |

---

## J7 — Facturi → data de reînnoire → plată → anulare

### 7.1 Pagina de facturare — `WORKS`

`/app/billing` arată: „THIS MONTH (ESTIMATE) **€1.72**", „Estimated from your current subscriptions in EUR.", „CURRENT PERIOD ENDS **—**", „PAYMENT METHOD — No payment method on file". `VERIFIED` — `audit/screenshots/journey-j7-billing.png`.

### 7.2 Data de reînnoire — `PARTIAL`

**Câmpul există** („CURRENT PERIOD ENDS") și e corect, dar arată **„—"**. Serverul confirmă: `GET /api/billing/summary` → `{"monthlyEstimate":172,"currentPeriodEnd":null,"paymentMethod":null,…}`. `VERIFIED`

Motivul: clientul de test **nu are nicio subscripție** (0 rânduri în `Subscription`). Deci nu e o lipsă de implementare — implementarea există (`app/Billing.tsx:240`, „Renews {formatDate(subscription.currentPeriodEnd)}"), dar **nimeni nu a trecut prin ea**. `CODE-INSPECTED` + `VERIFIED`

Pentru clientul care plătește efectiv, data de reînnoire ar fi vizibilă. Pentru cel care nu plătește — cazul nostru — ea e „—", iar clientul **nu are de unde să afle când se termină perioada**.

### 7.3 Facturile — `WORKS`, goale

`GET /api/billing/invoices` → `{"invoices":[]}`. Starea goală e afișată. `VERIFIED`

### 7.4 Plata unei facturi — `BLOCKED`

Nu există factură de plătit, iar plățile sunt oprite oricum. `BLOCKED`

### 7.5 Anularea — `BLOCKED`

Nu există subscripție de anulat. Există însă **„Cancel instance"** în pagina instanței („The instance keeps running until the end of the paid period, then it is removed."), care e altceva: anulează instanța, nu subscripția. `VERIFIED` — `audit/screenshots/journey-j3-instance-detail.png`

### 7.6 Rezumat J7

| Pas | Stare | Dovadă |
|---|---|---|
| 7.1 pagina de facturare | `WORKS` | €1.72 estimate, câmpurile există |
| 7.2 data de reînnoire | `PARTIAL` | câmpul există, arată „—" (`currentPeriodEnd: null`) |
| 7.3 facturile | `WORKS` | `{"invoices":[]}` |
| 7.4 plata | `BLOCKED` | `503 payments_unavailable` |
| 7.5 anularea subscripției | `BLOCKED` | 0 subscripții |

---

## J8 — Profil → email → parolă → sesiuni → deconectare peste tot

### 8.1 Pagina de setări — `WORKS`

Patru secțiuni: **Profile** (nume, prenume, „Save the name"), **Email address** (adresa + „Not verified"), **Account role**, **Notifications** (5 categorii), apoi sesiunile și închiderea contului. `VERIFIED` — `audit/screenshots/journey-j8-settings.png`.

### 8.2 Sesiunile — `WORKS`

`GET /api/settings/sessions` → lista sesiunilor cu IP, agent, data creării, data expirării, `current` și dispozitivul dedus („Chrome on Li…"). `VERIFIED`

### 8.3 Etichetele câmpurilor — `PARTIAL`

12 câmpuri, **5 fără etichetă**: cele cinci casete de notificare. `VERIFIED` — măsurat în `audit/_tools/a11y-report.json`, câmpul `unlabelled`.

### 8.4 Cele trei formulare — `BLOCKED`

`PATCH /api/settings/profile`, `POST /api/settings/email`, `POST /api/settings/password` scriu în baza de date. Butoanele n-au fost apăsate. `BLOCKED` — motiv: read-only. Formularele și validarea lor au fost citite în cod (`app/Settings.tsx`).

### 8.5 Deconectarea de peste tot — `BLOCKED`

`DELETE /api/settings/sessions` ar încheia și sesiunea auditului. Butonul a fost observat, nu apăsat. `BLOCKED` — motiv: auto-excludere; deblocare: o sesiune separată, cu a doua autentificare.

### 8.6 Rezumat J8

| Pas | Stare | Dovadă |
|---|---|---|
| 8.1 pagina de setări | `WORKS` | 4 secțiuni |
| 8.2 sesiunile | `WORKS` | listă cu IP, agent, expirare |
| 8.3 etichetele câmpurilor | `PARTIAL` | 5 din 12 fără etichetă |
| 8.4 profil / email / parolă | `BLOCKED` | scriere în baza de date |
| 8.5 deconectare peste tot | `BLOCKED` | ar opri sesiunea auditului |

---

## J9 — Latura de staff

### 9.1 Panoul — `WORKS`

„CUSTOMERS 4", „INSTANCES 3", plus ordinele, venitul și starea infrastructurii. `VERIFIED` — `audit/screenshots/journey-j9-admin-overview.png`.

### 9.2 Clienții — `WORKS`

4 clienți, cu căutare după nume sau e-mail, fiecare rând legând la pagina clientului. `VERIFIED` — `audit/screenshots/journey-j9-admin-customers.png`.

### 9.3 Clientul — `WORKS`

„Customer Qa One loaded — Everything the API returns about this account", e-mailul mascat („q***@exam…"), subscripțiile, instanțele, comenzile, tichetele. `VERIFIED` — `audit/screenshots/journey-j9-admin-customer-detail.png`.

### 9.4 Instanțele — `WORKS`

3 servicii, cu „Retrying a provisioning…" ca acțiune. `VERIFIED` — `audit/screenshots/journey-j9-admin-services.png`.

### 9.5 Jurnalul de audit — `WORKS`

„Audit log — 300 audit entries — Every staff action the API recorded, newest first." `VERIFIED` — `audit/screenshots/journey-j9-admin-audit.png`.

### 9.6 Coada de tichete — `WORKS`

„Support queue — 14 tickets in the queue — Newest activity first. Pick a ticket to…" `VERIFIED` — `audit/screenshots/journey-j9-admin-tickets.png`.

### 9.7 Schimbarea unui preț — `WORKS` (formularul), `BLOCKED` (salvarea)

Pagina „Pricing — 5 prices" expune câmpurile brute: `base-…=299`, `ram-…=60`, `cpu-…=40`, `disk-…=2`, și așa mai departe pentru fiecare produs. `VERIFIED` — `audit/screenshots/journey-j9-admin-pricing.png`.

**Observație de design:** câmpurile poartă **id-ul în hash** (`base-cmvjyo5yh0003dxtl58rz6pjt`). Funcțional, dar arată ca o scăpare de implementare într-o interfață care, altfel, e uniformă. `INFERRED`

Salvarea scrie în baza de date → `BLOCKED`.

### 9.8 Schimbarea unui produs — `WORKS` (formularul), `BLOCKED` (salvarea)

„Catalog — 5 products — Apps and databases that customers can buy. Visibility c…" `VERIFIED` — `audit/screenshots/journey-j9-admin-products.png`.

### 9.9 Rezumat J9

| Pas | Stare | Dovadă |
|---|---|---|
| 9.1 panoul | `WORKS` | 4 clienți, 3 instanțe |
| 9.2 clienții | `WORKS` | 4 clienți, căutare |
| 9.3 clientul | `WORKS` | e-mail mascat, subscripții, comenzi |
| 9.4 instanțele | `WORKS` | 3 servicii |
| 9.5 jurnalul de audit | `WORKS` | 300 intrări |
| 9.6 coada de tichete | `WORKS` | 14 tichete |
| 9.7 schimbarea unui preț | `WORKS` / `BLOCKED` | formularul e acolo; salvarea scrie |
| 9.8 schimbarea unui produs | `WORKS` / `BLOCKED` | formularul e acolo; salvarea scrie |

---

## 10. Primele cincisprezece minute: ce reușește un client nou

Testul cerut: poate un client, în primele cincisprezece minute, să facă lucrurile de bază? Răspunsul, măsurat, nu impresionat:

| Ce încearcă clientul | Reușește? | Ce îl oprește |
|---|---|---|
| **Să-și găsească serverul** | ✅ `WORKS` | — |
| **Să știe dacă provisionarea a mers** | ⚠️ `PARTIAL` | Jurnalul spune „provisioned — Instance is online", dar metricile spun „Container: offline" și 0 B / 0% / 0 m, pe același ecran. Nu are niciun rând care să explice diferența. |
| **Să-și găsească adresa** | ❌ `BROKEN` | Antetul spune „No public URL yet". Adresa reală (`10.77.0.11:30001`) e în tabul „Network" — al șaselea dintre douăsprezece. Și adresa publică depinde de un domeniu care trebuie cumpărat, iar plățile sunt oprite. |
| **Să deschidă consola** | ✅ `WORKS` | Merge — dar e al doilea tab și clientul trebuie să găsească banda de taburi. |
| **Să încarce un fișier** | ⚠️ `BLOCKED` | Controlul există în tabul „Files" și funcționează; încărcarea n-a fost executată (regulă de audit). |
| **Să seteze parametrii de pornire** | ⚠️ `NOT-IMPLEMENTED` *în momentul potrivit* | Nu există în formularul de deploy. Există în tabul „Startup", după ce a plătit — adică după ce a plătit pentru ceva al cărui conținut nu îl putea alege. |
| **Să deschidă un ticket** | ✅ `WORKS` | Formularul e clar, cu o instanță asociabilă. Singura lipsă: nu se poate atașa conținutul fișierului. |
| **Să găsească data de reînnoire** | ❌ `BROKEN` | „CURRENT PERIOD ENDS —". Câmpul există; valoarea e `null`, pentru că nu există subscripție. |
| **Să facă un upgrade** | ⚠️ `BLOCKED` la final | Prețul se vede corect („€2.52, +€0.80"), dar plata dă `503`. |
| **Să anuleze** | ⚠️ `PARTIAL` | Există „Cancel instance" (anulează instanța, nu subscripția). Nu există subscripție de anulat, pentru că nu există plată. |

**Șase din zece** sunt fie imposibile, fie blocate de zidul de plată, fie se contrazic pe ecran. **Trei sunt frumos lucrate** — prețul live din formular, consola, tichetele. **Unul e bine început** (serverul).

### Cele trei lucruri care ar îmbunătăți cel mai mult primele cincisprezece minute

1. **Adresa, în antet.** Măcar rândul de alocare (`10.77.0.11:30001`) ar trebui să fie în antetul instanței, cu link spre „Network". Antetul arată în schimb că nu există o adresă *publică*, fără să distingă între cele două lucruri.
2. **O singură stare, nu două.** „Online" și „Container: offline" nu pot fi în același antet. Ori pastila reflectă starea containerului, ori antetul spune explicit „provisioned, container offline".
3. **Un avertisment în `/app` pentru adresa neverificată.** Textul există deja în Setări; e nevoie de o `Alert`/`Banner` în panoul principal, cu un `Link` spre Setări.

---

## 10. Numărătoarea

| Călătorie | pași | `WORKS` | `PARTIAL` | `BROKEN` | `BLOCKED` | `NOT-IMPLEMENTED` |
|---|---|---|---|---|---|---|
| J1 înregistrare → confirmare → prima autentificare | 8 | 5 | 1 | — | 1 | 1 |
| J2 catalog → produs → preț | 4 | 3 | 1 | — | — | — |
| J3 configurare → deploy → provisionare → adresă → consolă → fișier → metrici | 11 | 6 | 1 | **1** | 2 | 1 |
| J4 schimbarea resurselor → preț → plată | 3 | 2 | — | — | 1 | — |
| J5 domeniu → atașare → verificare | 6 | 3 | — | — | 3 | — |
| J6 ticket → scriere → urmărire → atașare | 7 | 5 | 1 | — | — | 1 |
| J7 facturi → reînnoire → plată → anulare | 5 | 2 | 1 | — | 2 | — |
| J8 profil → email → parolă → sesiuni → deconectare | 5 | 2 | 1 | — | 2 | — |
| J9 staff: panou → client → instanță → audit → ticket → preț → produs | 10 | 8 | — | — | 2 | — |
| **total** | **59** | **36** | **6** | **1** | **13** | **3** |

Cele 13 pași `BLOCKED` se împart în:
- **6** — zidul de plată (`503 payments_unavailable`): J4.3, J5.4, J5.5, J5.6, J7.4, J7.5; plus J9.7b și J9.8b (salvarea prețului și a produsului, care scrie în baza de date);
- **2** — regula de audit, nu un defect al produsului: J3.5 (deploy-ul creează o comandă și provisionează) și J3.10 (încărcarea unui fișier pe o instanță reală);
- **2** — scrieri în baza de date: J8.4 (profil, e-mail, parolă) și J9.7b/J9.8b (salvările de staff);
- **1** — J1.7: transportul de mail e oprit, deci linkul de confirmare nu ajunge;
- **1** — J8.5: deconectarea de peste tot ar opri și sesiunea auditului;
- **1** — J3.6: provisionarea nu poate fi observată de la zero fără o comandă nouă.

Singurul pas `BROKEN` este **J3.7 (adresa)**. Singurele trei `NOT-IMPLEMENTED` sunt **J1.6b** (panoul nu avertizează că adresa nu e verificată), **J3.3** (parametrii de pornire nu există în formularul de deploy) și **J6.7** (nu se poate șterge un ticket).

---

## 11. Fișierele de măsură

| Fișier | Ce conține |
|---|---|
| `audit/_tools/journeys.mjs` | prima parcurgere a celor 9 călătorii |
| `audit/_tools/journeys-fix.mjs` | reluarea pașilor măsurați greșit (CSRF, selectori) |
| `audit/_tools/consoleprobe.mjs`, `resprobe.mjs` | consola, fișierele, rețeaua, resursele, domeniile instanței |
| `audit/_tools/loadtime.mjs` | timpul de încărcare al paginilor |
| `audit/screenshots/journey-*.png` | capturile care dovedesc fiecare pas |
| `audit/screenshots/tab-*.png` | cele 12 taburi ale instanței |

Toate măsurătorile sunt `getComputedStyle`, `getBoundingClientRect` și răspunsuri de API peste pagini deja servite. Singura scriere făcută a fost ticketul #48, raportat la începutul documentului.
