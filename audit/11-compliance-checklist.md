# 11 — Checklist de conformitate pentru un operator/reseller de hosting de joc în UE (România)

> **Agent:** A11 (audit tehnic + comercial, sesiune ramură).
> **Natură:** audit **read-only**. Singurele fișiere scrise: cele trei documente `11-*.md` din acest director.
> **Producție:** nicio scriere, nicio comandă, nicio plată, niciun e-mail, nicio ștergere de date de clienți. O singură autentificare în browser, cu contul de test seed-uit.

## ⚠️ 0. Declarație de limită — citită înainte de orice altceva

**Acesta nu este un consult juridic și nu este un consult fiscal. Nu sunt avocat și nu sunt contabil.**

- Fiecare element **legal, fiscal sau de dreptul consumatorului** este marcat `NEEDS-PROFESSIONAL-CONFIRMATION` și însoțit de **întrebarea concretă** care trebuie pusă unui profesional (avocat specializat în dreptul consumatorului / protection des données, respectiv contabil sau consultant fiscal cu autorizare în România).
- Ceea ce poate fi verificat eu **fără consult juridic** este **faptul tehnic**: dacă un mecanism există sau nu în cod și în baza de date. Aceasta e partea pe care o verific și pe care o susțin cu dovezi.
- Statutul `NOT-IMPLEMENTED` înseamnă „**mecanismul nu există în platformă**", **NU** „e ilegal". Multe dintre elementele de mai jos ar putea fi satisfăcute **offline** (un document semnat pe hârtie, un contract cu furnizorul, un registru ținut în Excel). Platforma nu e locul unde se rezolvă automat — dar **acolo unde platforma ar trebui să susțină un drept al clientului, și nu o face, e o lacună reală**.
- Un element marcat `SATISFIED-VERIFIED` înseamnă „am verificat tehnic că mecanismul există și funcționează". **Nu înseamnă că dreptul este corect implementat din punct de vedere juridic** — pentru asta e nevoie de confirmare profesională.
- Nu am făcut și **nu fac** încadrare fiscală, nu am consultat registre publice, nu am verificat existența sau forma juridică a entității, și nu am contactat niciun furnizor. Nu am inventat nicio cifră, nicio cotă, niciun prag, nicio citare.

---

## 1. Legendă de status

| Status | Semnificație |
|---|---|
| `SATISFIED-VERIFIED` | Mecanismul există și funcționează; verificat tehnic cu dovezi |
| `PARTIAL` | Mecanismul există dar are o lacună identificată, sau acoperă doar partea tehnică |
| `NOT-IMPLEMENTED` | Mecanismul necesar **nu există** în platformă |
| `BLOCKED` | Nu se poate verifica în condițiile auditului read-only |
| `NEEDS-PROFESSIONAL-CONFIRMATION` | Element legal/fiscal: **trebuie confirmat de un profesional**, cu întrebarea pusă în rând |

---

## 2. Sinteză

| # | Domeniu | Status |
|---:|---|---|
| C-01 | Identificarea operatorului | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-02 | Informare precontractuală B2C | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-03 | Termeni și condiții | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-04 | Politica de utilizare acceptabilă | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-05 | Dreptul de retragere | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-06 | Garanții legale și reclamații | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-07 | E-mail: verificare a adresei, resetare parole | `PARTIAL` (transportul lipsește) |
| C-08 | E-mail: anti-spam și consimțământ | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-09 | E-mail: livrare și trasabilitate | `NOT-IMPLEMENTED` |
| C-10 | Facturare și document fiscal | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-11 | TVA | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-12 | Praguri de înregistrare fiscală | `BLOCKED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-13 | GDPR: bază legală și informare (art. 6, 13, 14) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-14 | GDPR: dreptul de acces (art. 15) | `PARTIAL` |
| C-15 | GDPR: dreptul la ștergere (art. 17) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-16 | GDPR: portabilitate (art. 20) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-17 | GDPR: rectificare, opoziție, restricție | `PARTIAL` |
| C-18 | GDPR: securitatea prelucrării (art. 32) | `PARTIAL` |
| C-19 | GDPR: contracte cu procesatori (art. 28) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-20 | GDPR: notificarea încălcerii (art. 33) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-21 | GDPR: registre, DPO, consultări | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-22 | Transferuri internaționale (art. 44–49) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-23 | Cookie-uri | `PARTIAL` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-24 | IP, porturi și dreptul de folosire | `PARTIAL` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-25 | Politica de abuz și procesul de raportare | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-26 | DMCA / takedown (conținut hosted) | `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION` |
| C-27 | Retenția efectivă a datelor | `PARTIAL` (doar sesiunile) |
| C-28 | Dreptul de ștergere în materialul de backup | `NOT-IMPLEMENTED` |
| C-29 | Ecrane de conformitate în interfață | `NOT-IMPLEMENTED` |

**Total: 29 de elemente. Zero `SATISFIED-VERIFIED`.** Niciunul dintre elementele de conformitate pe care le-ați cerea unui client, unui consumator sau unui autorității, nu este acoperit astăzi de platformă.

---

## 3. Consumator și contract

### C-01 — Identificarea operatorului și informarea precontractuală

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

Regimul contractelor cu consumatori în schimburi la distanță cere ca înainte de încheierea contractului să fie aduse la cunoștință, în mod clar și comprehensibil: **identitatea și contactele operatorului** (denumire, adresă, e-mail, telefon), **informațiile comerciale** (CUI/număr de înregistrare, sediu), prețul și condițiile de plată, termenul de garanție, dreptul de retragere și procedura de reclamații.

**Ce am verificat tehnic:**

| Element cerut | Stare | Evidență |
|---|---|---|
| Denumire socială | **nu apare nicăieri** | `VERIFIED` — footer-ul are doar `© {an}` și logo: `web/src/home/Rest.tsx:56-68` |
| CUI / număr de înregistrare fiscală | **nu apare nicăieri** | `VERIFIED` — `grep` pe tot repo-ul; `README.md` nu conține `CUI` |
| Sediu social | **nu apare nicăieri** | `VERIFIED` — același grep |
| Telefon de contact | **nu apare nicăieri** | `VERIFIED` — `grep -rniE "telephone|telefon|\+40[0-9]"` → zero potriviri |
| Adresă de e-mail de contact | există, dar **doar ca implicit** | `CODE-INSPECTED` — `MAIL_SUPPORT_EMAIL` default `support@blipmade.com` (`api/src/env.ts:63`); **neconfigurat** pe VM 103 (`VERIFIED`), deci se folosește valoarea implicită; și nu apare în interfață |
| Date fiscale în configurare | **absente** | `VERIFIED` — lista completă de chei din `.env` nu conține niciun identificator de entitate |
| Link la Termeni / Impressum în footer | **nu există** | `VERIFIED` — `web/src/home/Rest.tsx:62-66`: nav = Apps · Pricing · Docs · Status · Log in/Dashboard |

**Întrebare pentru profesional:**
> „Blipmade operează ca platformă de găzduire cu clienți persoane fizice din România. Ce elemente de identificare a operatorului (denumire, formă juridică, CUI, sediu, telefon, e-mail) trebuie afișate pe site și în contractul cu consumatorul, și în ce formă exactă (site, contract, ambele)? Care este obligatoriu să apară **înainte** de plasarea comenzii, pentru ca platforma să poată continua să vândă consumatorilor din România?"

---

### C-02 — Informare precontractuală B2C (buton de comandă, preț, termeni)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `VERIFIED` (browser) — pe `/app/deploy/discord-bot`, pasul 1 („Configure") și pasul 2 („Review") nu există **nicio căsuță de bifare, niciun link, nicio trimitere către termeni sau condiții**. Comanda este creată printr-un singur POST la pasul 2→3. Nu există niciun artefact de tip „accept terms" în schemă: `grep` pe `api/prisma/schema.prisma` → niciun model, nicio coloană de consimțământ.

În schimb, **prețul este transparent** (pasul 1 arată „PER MONTH €1.72" și explică explicit supraschimbarea: „The price of the smallest configuration is €1.49/mo. The amount above is the price of the configuration you chose." — `VERIFIED`, text real) și **resursele configurabile sunt afișate înainte de plată** (`VERIFIED`). Comanda conține și linia de produs cu configurația aleasă (`config: {cpu:1, ram:512, disk:5}` — `VERIFIED` prin `GET /api/orders`).

**Întrebare pentru profesional:**
> „În fluxul actual, clientul apasă «Review order» și apoi «Pay and deploy», fără niciun pas de acceptare a termenilor și fără niciun document de informare precontractuală. Ce formă trebuie să aibă acceptarea termenilor pentru a fi validă ( bifă individuală, buton cu mențiune explicită, link afișat permanent), și unde trebuie să fie publicate condițiile generale și informațiile precontractuale obligatorii?"

---

### C-03 — Termeni și condiții generale

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `VERIFIED` — `grep -rliE "terms of service|termeni și condiții|acceptable use|utilizare acceptabilă"` pe întregul repo (`.md`, `.txt`, `.html`, `.tsx`, `.ts`) → **nicio potrivire în fișierele proprii**; singurele potriviri sunt tipăririle din `api/node_modules/stripe/types/**` (irante) și un document al altui agent de audit. `web/public` conține doar `favicon.svg` și `fonts/`.

**Întrebare pentru profesional:**
> „Redactați condițiile generale pentru o platformă de găzduire cu abonament (durata minimă, reînnoirea automată, dreptul de retragere și efectul lui asupra unui serviciu deja provisionat, suspendarea pentru neplată, limitarea de răspundere, clauza de forță majoră, legea aplicabilă și instanțe). Care este structura minimă obligatorie pentru un consumator din România și ce clauze sunt specifice găzduirii (SLA, resurse, suspendare, reutilizarea adresei IP)?"

---

### C-04 — Politica de utilizare acceptabilă

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există niciun document, nicio rută, niciun enunț în interfață care să spună clientului ce nu are voie să facă pe serverul găzduit (mining, spam, atac DDoS, proxy, warez, gajiri, piraterie). `web/src/pages/Docs.tsx` (110 KB) conține documentație tehnică și de API, dar nu o AUP (`CODE-INSPECTED`).

Nici infrastructura nu are limite aplicate care să susțină o AUP: `03-infrastructure.md` F-09 notează „**Nicio limită de resurse per container pe VM 103**" (`DOCUMENTED-ONLY`).

**Întrebare pentru profesional:**
> „Ce conținut trebuie să aibă o AUP pentru găzduire de joc în România (activități prohibite explicit, dreptul de suspendare imediată, dreptul de reziliere, obligația de a coopera la plângeri), și cum se raportează la dreptul consumatorului la serviciu în caz de suspendare pentru încălcare?"

---

### C-05 — Dreptul de retragere de la contractul încheiat la distanță

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. **Nu există nicio rută de refund sau de anulare cu rambursare** în inventarul complet al API-ului (cele 130+ rute enumerate). Există `POST /billing/subscriptions/:id/cancel` și `POST /instances/:id/cancel`, dar anularea **nu înseamnă** retragere: nu există flux de rambursare, nu există notificare către client, iar în `web/src/app/InstanceDetail.tsx` textul este „The instance keeps running until the end of the paid period, then it is removed." (`CODE-INSPECTED`).

Agravant relevant: **nu s-a plătit niciodată nimic** (0 facturi, 0 abonamente — `VERIFIED`), deci fluxul nu a fost niciodată exercitat, iar în plus `POST /orders/:id/checkout` răspunde `503` (`VERIFIED`, vezi `11-onboarding.md` §4.2).

**Întrebare pentru profesional:**
> „Clientul încheie online un abonament de găzduire cu pornire imediată. Cum se aplică dreptul de retragere unui serviciu care a fost deja provisionat și activat? Există un termen în care consumatorul poate renunța fără penalizare și cine plătește costul de recuperare a resurselor deja consumate? Cum trebuie formulat butonul de anulare pentru a nu se confunda cu o anulare fără drept de rambursare?"

---

### C-06 — Garanții legale și procedură de reclamații

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există pagină de garanții, nu există procedură de reclamații, nu există termen de garanție menționat. Singurul mecanism de reclamații este ticketul in-app — care, conform `11-support-and-operations.md`, **nu notifică pe nimeni** (0/14 ticketuri cu răspuns).

**Întrebare pentru profesional:**
> „Ce trebuie să declare platforma privind garanția legală de conformitate pentru un serviciu digital, cum trebuie formulată procedura de reclamații (termene, adresă, căi alternative), și ce obligatoriu trebuie afișat în interfață și în contract?"

---

## 4. E-mail

### C-07 — Verificarea adresei de e-mail și resetarea parolei

**Status: `PARTIAL`** — codul e complet, transportul nu există.

**Ce există (`CODE-INSPECTED`):** `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /verify-email`, `web/src/pages/VerifyEmail.tsx`, `web/src/pages/ForgotPassword.tsx`, `web/src/pages/ResetPassword.tsx`; tokenul de verificare e stocat ca hash (`VerificationToken.tokenHash`), cu `expiresAt`.

**Ce lipsește (`VERIFIED`):** `SMTP_URL` este gol ⇒ transportul `file`. Rezultat: **4 270 fișiere** în `/var/backups/blipmade/mail/`, dintre care **4 175** „Confirm your Blipmade email address" și **22** „Confirm the new address of your Blipmade account". **Zero livrări** (`MailDelivery`: 15 rânduri, toate `written-to-file`).

**De ce contează pentru conformitate:** resetarea parolei este **singurul mecanism de recuperare a contului**. Dacă un client își uită parola, e-mailul nu ajunge → **contul e pierdut definitiv**. Și e un cerințeu de securitate GDPR, nu doar de produs.

**Este o cerință legală?** Da — dar verificarea e-mailului ca atare e o decizie de produs; obligația relevantă e că datele de contact să fie corecte și actualizabile. `NEEDS-PROFESSIONAL-CONFIRMATION` pentru întrebarea conexă de la C-13.

---

### C-08 — Anti-spam, consimțământ și comunicări comerciale nesolicitate

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. **Nu există niciun mecanism de consimțământ, niciun unsub, nicio listă de dublu-opt-in, nicio preferință de marketing.** `web/src/app/Settings.tsx` are o secțiune de **preferințe de notificare** (`PUT /settings/notifications`, `GET /settings/notifications`) — dar aceasta controlează **notificările tranzacționale ale platformei**, nu comunicările comerciale.

Corespunzător, `api/src/env.ts` are `MAIL_SUPPORT_EMAIL`, dar **nu există niciun `MAIL_MARKETING_*`**, nicio listă de destinatari, niciun `unsubscribe` în șabloane (`api/src/lib/email-templates.ts` — `CODE-INSPECTED`).

**Observație pozitivă, relevantă pentru conformitate:** platforma **nu trimite e-mailuri comerciale nesolicitate** — pentru că nu trimite e-mailuri deloc (`VERIFIED`). Totuși, acest „avantaj" dispare imediat ce se repară C-07, iar atunci **nu există niciun cadru de conformitate gata**. Deci C-07 trebuie remediat **împreună cu** C-08, nu înaintea lui.

**Întrebare pentru profesional:**
> „Blipmade va trimite clienților e-mailuri tranzacționale (confirmări, facturi, notificări de ticket). Care dintre acestea intră în regimul de comunicare electronică comercială din legislația românească, care este regimul consimțământului pentru comunicările de marketing (opt-in/opt-out, proba consimțământului), și ce trebuie să conțină mesajele tranzacționale pentru a fi considerate conforme (identificarea expeditorului, dreptul de opoziție, datele de contact)?"

---

### C-09 — Livrare, trasabilitate și dovezi de trimitere

**Status: `NOT-IMPLEMENTED`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există bounce handling, nu există lista de supresie, nu există SPF/DKIM/DMARC configurat de platformă, nu există nicio statistică de livrare. `MailDelivery` are câmpurile `attempts`, `lastErrorClass`, `lastError` (`api/prisma/schema.prisma:72-96`), dar **nu există niciun handler care să le populeze** în caz de eșec SMTP, pentru că nu există transport SMTP.

Consecință directă: **nu există nicio urmă a unui e-mail trimis**. Pentru orice solicitare de dovadă (factură, confirmare de comandă, dovadă de notificare a clientului), platforma nu are ce produce.

---

## 5. Facturare și fiscalitate

### C-10 — Document fiscal și factură

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Ce există (`CODE-INSPECTED`):** modelul `Invoice` (`api/prisma/schema.prisma:461-494`) cu `number`, `status`, `amount`, `tax`, `total`, `currency`, `hostedUrl`, `pdfUrl`, `paidAt`, `periodStart`, `periodEnd`, `dueDate`; numerotare de forma `BM-INV-{00001}` în `api/src/services/billing.ts:118-131`; interfață `/app/billing` cu secțiunea „Invoices".

**Ce lipsește (`VERIFIED`):** **`Invoice` = 0 rânduri**, `Subscription` = 0 rânduri, `Payment` = 0 rânduri. Comanda `POST /billing/invoices` nu există în inventarul rutelor; facturile se creează doar din webhook-ul Stripe (`api/src/services/stripe.ts:441`) sau la reînnoire (`billing.ts:119`) — **ambele inaccesibile cât timp plățile sunt oprite** (`VERIFIED`: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` de lungime 0).

**Insuficiențe de fond, independente de blocajul tehnic (`CODE-INSPECTED`):**
- **Nu există fiscalizare** (nici ANAF/TVA-e, nici SPV, nici factură în format de plată electronică).
- **`Invoice.tax` este `0` prin definiție** (`schema.prisma:466` — `tax Int @default(0)`), iar factura locală e creată cu `tax: 0` explicit (`billing.ts:125`).
- **`Invoice` nu are câmpuri de identificare fiscală a emitentului** (nici CUI, nici adresă, nici cont bancar, nici mențiune cu regimul TVA).

**Întrebare pentru profesional:**
> „Ce document fiscal trebuie emis pentru un abonament de găzduire plătit online către un consumator din România, ce câmpuri obligatorii trebuie să conțină (identificarea emitentului, CUI, adresă, IBAN, data emiterii, scadență, regimul TVA, mențiunea cu TVA și plata online), și este obligatorie fiscalizarea electronică la acest nivel de facturare? Ce termen și ce penalități se aplică pentru neplata unei facturi de abonament și ce trebuie să prevadă procedura de suspendare?"

---

### C-11 — TVA

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. `grep -rniE "\bvat\b|taxRate|tax_rate|reverse.?charge|tva"` pe `api/src` și `web/src` → **zero potriviri** (`CODE-INSPECTED`). Factura locală e creată cu `tax: 0` (`billing.ts:125`), iar modelul are doar `tax Int @default(0)`.

**Puncte deschise, pentru profesional:**
1. **Cota** aplicabilă găzduirii de servere (nu am nicio cotă verificată și nu o voi afirma).
2. **Locul stabilirii** prestării (servere în România / infrastructură în România, dar clienți și în alte state) — determină regimul de TVA și eventuala taxare inversă.
3. **TVA între statele membre** pentru clienți persoane fizice din alte state UE (OSS sau neaplicabilitate, în funcție de regulile aplicabile).
4. **Pragurile de TVA intracomunitară** și obligația declarării recapitulative (` recapitulative ` / `TVA`).

**Întrebare pentru profesional:**
> „Blipmade găzduiește servere pe infrastructură situată în România și vinde abonamente clienților (persoane fizice și juridice) din România și din alte state UE. Ce cotă de TVA se aplică serviciului de găzduire, care este locul stabilirii prestării pentru fiecare tip de client, cum se tratează clienții consumatori din alte state membre (OSS vs neaplicabilitate, pragul de TVA intracomunitară), și ce obligații de declarare și de facturare există pentru fiecare categorie?"

---

### C-12 — Praguri de înregistrare fiscală și de încadrare

**Status: `BLOCKED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**De ce `BLOCKED`:** nu pot verifica forma juridică a entității, cifra de afaceri, dacă există sau nu înregistrare la Registrul Comerțului, dacă operatorul este plătitor de TVA sau în regim de TVA încasat. Nu am consultat registre publice (nu am acces și nu e rolul unui audit read-only al platformei) și **nu voi afirma praguri pe care nu le-am verificat**.

**Ce am putut verifica (`VERIFIED`):** platforma **nu conține niciun identificator fiscal** — `.env` nu conține chei de entitate, `README.md` nu conține `CUI` sau sediu, footer-ul nu conține nimic (`CODE-INSPECTED`, `web/src/home/Rest.tsx:56-68`).

**Întrebare pentru profesional:**
> „Care sunt pragurile de înregistrare fiscală aplicabile unei entități care vinde servicii de găzduire online către consumatori din România ( TVA, profit, cifra de afaceri, normele de venit), și ce regim de TVA intracomunitară se activează la depășirea lui? Ce documentație trebuie să existe înainte de prima plată reală și cine o certifică?"

---

## 6. GDPR

### C-13 — Baza legală și informarea (art. 6, 13, 14)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. **Nu există politici de confidențialitate, nici în repo, nici în interfață, nici trimisă prin e-mail.** `grep -rliE "privacy policy|politică de confidențialitate|data processing agreement"` → zero fișiere proprii.

Ce **se** face bine, și e relevant pentru informare:
- **Minimizarea e reală și verificabilă:** `User` (`api/prisma/schema.prisma:23-70`) conține `email`, `passwordHash`, `firstName`, `lastName`, `role`, `emailVerifiedAt`, `pterodactylUserId`, `pterodactylExternalId`, `suspendedAt`, `deletionRequestedAt`, `createdAt`, `updatedAt` — **niciun telefon, nicio adresă, niciun număr de document, nicio IBAN**. `CODE-INSPECTED`.
- **Parola e stocată ca hash**, nu în clar (`hashPassword`, `api/src/routes/auth.ts`).
- **Sesiunea e stocată ca hash de token** (`Session.tokenHash`, `api/src/plugins/auth.ts:66`), nu tokenul brut.
- **E-mailurile sunt mascate implicit în interfața de administrare** (`web/src/admin/Customers.tsx:12` — „E-mail addresses are masked by default").
- **Nu există trackere terți** (nici GA, nici Sentry, nici Hotjar) — `VERIFIED` prin grep pe `web/src` și `web/index.html`.

Ce lipsește pentru informare:
- **Nu există text de informare** cu identitatea operatorului, scopurile, baza legală, categoriile de date, termenele de păstrare, destinatarii, transferurile, drepturile și autoritatea de control.
- **Nu există suport pentru acordul de marketing** (C-08) — deci nu se poate documenta un acord care nu se cere.
- **Nu există mențiune despre transferuri internaționale** (C-22).

**Întrebare pentru profesional:**
> „Blipmade prelucrează: adresă de e-mail, nume, adresă IP, agent de utilizator, parole (hash), conținut de fișiere în cont, istoric de ticketuri și conținut de e-mailuri, plus identificatori de server și UUID de panou. Care este baza legală corectă pentru fiecare categorie (execuție de contract, interes legitim, obligație legală, acord), ce text de informare trebuie publicat și unde (site, contract, ambele), și ce informații minime trebuie să conțină?"

---

### C-14 — Dreptul de acces (art. 15)

**Status: `PARTIAL`**

**Ce merge (`VERIFIED`):** `GET /settings` întoarce profilul complet (nume, e-mail, `emailVerified`, `createdAt`, `deletionRequestedAt`), lista de sesiuni cu IP și agent de utilizator (`GET /settings/sessions`), notificările preferințate, serviciile și abonamentele. Deci **clientul poate vedea aproape tot ce ține de el, din interfață**. E un acces bun, mai bun decât multe platforme.

**Ce lipsește (`CODE-INSPECTED`):**
- **Nu există nicio rută de export în masă** (`GET /settings/export` sau similar): inventarul complet al celor **141 de rute API** unice (`VERIFIED` prin enumerare) nu conține `export`.
- **Nu este vizibil** logul de audit al propriului cont, care conține `actorEmail` și `ip` pentru fiecare acțiune (`api/prisma/schema.prisma:763-779`).
- **Nu sunt vizibile** istoricul de comenzi în forma completă cu linii și sume, plățile și datele de facturare (0 facturi oricum), mesajele de ticket în arhivă, sau istoricul de e-mailuri livrate (`MailDelivery`).

**Întrebare pentru profesional:**
> „Accesul la date se face acum din interfață, dar nu există export în masă și nu sunt vizibile logul de audit și istoricul de ticketuri. Este suficient pentru art. 15, sau trebuie un export complet, într-un format lizibil, care să acopere și datele din sistemele conexe (panoul Pterodactyl, Stripe)?"

---

### C-15 — Dreptul la ștergere (art. 17)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Aceasta este cea mai gravă lacună tehnică din tot checklist-ul.**

**Ce există (`CODE-INSPECTED`):**
- `POST /settings/account/closure` (`api/src/routes/settings.ts:475-525`) — setează `User.deletionRequestedAt`, scrie audit `settings.account_closure_requested`, și **nu șterge nimic**. Comentariul din cod e explicit: „This is a request and not a deletion. The services and the subscriptions of the customer are not touched by the request, and nothing is removed before a person of the team has looked at it."
- `DELETE /settings/account/closure` (`:528-541`) — anulează cererea (`deletionRequestedAt = null`).

**Ce nu există (`VERIFIED` prin căutare exhaustivă):**
- `grep -rn "user.delete\|prisma.user.delete"` în `api/src` → **zero potriviri**. **Nu există NICIO cale de ștergere a unui utilizator, în niciun fel.**
- **Nu există nicio unealtă de operare** care să execute ștergerea cerute de un om: `scripts/cleanup-data.sh` curăță **doar artefactele de verificare** (utilizatori cu adresă de test, produse cu prefix de test, instanțele/comenzile/abonamentele lor) și **explicit nu atinge** contul administratorului, catalogul de demo și **jurnalul de audit** (`CODE-INSPECTED`, comentariul din script).
- **Niciun worker, niciun timer, nicio coadă** nu examinează `deletionRequestedAt`. Timerele workerului sunt: `reconcile` (60 s), `pruneQueue` (10 min), `pruneSessions` (1 h), `sweepBilling` (15 min), `retryWebhooks` (5 min) — `CODE-INSPECTED` (`api/src/worker.ts`).

**Consecința, spusă fără atenuări:** *un client care își cere ștergerea contului rămâne cu datele în baza de date la nesfârșit, iar nimeni nu e în măsură să le șteargă, pentru că nu există instrumentul.* Se poate doar **anula** cererea.

**Ce e necesar (`CODE-INSPECTED`):** `User` are relații cu `onDelete: Cascade` către `Session`, `VerificationToken`, `Order`, `Instance`, `Ticket`, `TicketMessage`, `AuditLog` (cu `onDelete: SetNull` pe `actorId`), `Invoice`, `Payment`, `Subscription`, `PanelCredential`, `EmailChangeRequest`, `NotificationPreference` (`api/prisma/schema.prisma:53-70`). **Deci o ștergere reală ar fi în cascadă la nivel de bază de date** — dar `AuditLog` e doar `SetNull` pe `actorId`, deci **rândurile de audit rămân** (corect ca practică de păstrare a evidentelor, dar **e o decizie de retenție care trebuie declarată și fundamentată**).

**Întrebare pentru profesional:**
> „Platforma oferă doar un buton de «cerere de închidere a contului»: marchează `deletionRequestedAt` și nu șterge nimic, iar o cerere similară pentru o adresă de e-mail nici măcar nu ajunge în coada operatorului, pentru că e-mailul nu se livrează. Există un termen legal maxim în care cererea trebuie executată, ce categorii de date trebuie păstrate în urma unei ștergeri (evidențe contabile, jurnal de audit, dovezi în caz de abuz) și pe ce temei, și ce trebuie comunicat clientului despre acest termen?"

---

### C-16 — Dreptul la portabilitate (art. 20)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există rută de export, nu există format de export, nu există mențiune despre dreptul la portabilitate.

**Nuanță onestă:** conținutul tipic al unui server de găzduire (fișiere, baze de date ale clientului) este **al posesiei clientului, nu al platformei**, și este accesibil prin interfața de fișiere. Formatul de export automat privește **datele pe care le deține platforma** (profil, comenzi, facturi, ticketuri).

**Întrebare pentru profesional:**
> „Ce date trebuie exportate automat și în ce format (JSON, CSV, etc.) pentru a acoperi dreptul la portabilitate, și este suficient că datele de profil, comenzi, facturi și ticketuri sunt vizibile în interfață, sau este obligatoriu un export descărcabil, cu tot cu datele din sistemele terțe (panou, facturare)?"

---

### C-17 — Rectificare, opoziție, restricție de prelucrare

**Status: `PARTIAL`**

**Ce merge (`CODE-INSPECTED`, `VERIFIED` în browser):**
- **Rectificare:** `PATCH /settings/profile` (nume), `POST /settings/email-change` (adresă de e-mail, cu token), `PUT /settings/notifications` (preferințe). Toate funcționează la nivel de API.
- **Sesiuni:** `GET /settings/sessions` + `DELETE /settings/sessions/:id` — clientul poate închide sesiunile, inclusiv toate celelalte la schimbarea parolei (`api/src/routes/settings.ts:382`).
- **Suspendare:** `POST /admin/customers/:id/suspend` — cu ștergerea sesiunilor (`api/src/routes/admin.ts:292`).

**Ce lipsește:**
- **Nu există mecanism de opoziție** pentru prelucrarea bazată pe interes legitim (nici măcar ca opțiune de a te opune, în afara de nepromovarea marketingului).
- **Nu există restricție de prelucrare** (art. 18) — nicio opțiune de a marca un cont ca „doar păstrare".
- **Nu există consimțământ granular** (C-08), deci nici mecanism de retragere a consimțământului.

**Întrebare pentru profesional:**
> „Care dintre aceste drepturi trebuie oferite ca mecanisme autonome în interfață, și este suficient ca un client să poată șterge sesiunile, schimba e-mailul și opri notificările, sau trebuie un buton explicit de „reține datele mele" (restricție) și unul de „nu vreau să-mi fie datele prelucrate în baza legitimului interes"?"

---

### C-18 — Securitatea prelucrării (art. 32)

**Status: `PARTIAL`**

**Ce e bine, verificabil (`VERIFIED` / `CODE-INSPECTED`):**
| Măsură | Stare | Evidență |
|---|---|---|
| Cookie de sesiune | `httpOnly: true`, `sameSite: 'lax'`, `secure` urmărește protocolul, TTL 14 zile | `api/src/plugins/auth.ts:74-83`, `:11` |
| Cookie CSRF | `bm_csrf`, lizibil de JS, ecoul lui în headerul `X-CSRF-Token` | `api/src/plugins/auth.ts:10`, `api/src/plugins/csrf.ts` |
| Parole | hash (nu în clar) | `hashPassword` |
| Tokeni de sesiune | hash-uite în DB (`tokenHash`) | `api/src/plugins/auth.ts:66` |
| Limită de rate pe autentificare | 10 tentative / 15 min pe adresă | briefing + `api/src/routes/auth.ts` |
| Limită pe cererea de ștergere a contului | 5 / 15 min | `api/src/routes/settings.ts:476` |
| Containere | `no-new-privileges:true`, `cap_drop: ALL`, healthcheck | `compose.api.yml` (`VERIFIED`) |
| Ecrane de administrare | e-mailuri mascate implicit | `web/src/admin/Customers.tsx:12` |

**Ce e neacoperit (`VERIFIED`):**
- **Tokeni de verificare și de resetare de parolă în text clar, pe disc, în directorul de backup** — 4 270 fișiere, cu permisiuni `rw-rw-r--` (`/var/backups/blipmade/mail/`). Un token de resetare de parolă **nescurs** e echivalent cu un `reset` de parolă.
- **Jurnalul de audit conține `actorEmail` și `ip` pentru fiecare acțiune**, fără nicio retenție (`CODE-INSPECTED`: `grep -rn "auditLog.deleteMany"` → zero).
- **Logurile containerelor nu se rotesc** — nu există `/etc/docker/daemon.json` și nici `logrotate.d/docker` (`VERIFIED`).
- **`pve-firewall` dezactivat pe hypervisor** și **niciun firewall pe VM 102/103** (`03-infrastructure.md` F-03, F-10 — `DOCUMENTED-ONLY`).
- **Nu există backupuri programate** și `OFFSITE_TARGET` neconfigurat (`03-infrastructure.md` §9.1–9.2 — `DOCUMENTED-ONLY`).

**Întrebare pentru profesional:**
> „Ce măsuri de securitate trebuie considerate obligatorii pentru un operator de această dimensiune care prelucrează parole (hash-uite), tokeni de resetare, adrese IP și conținut de fișiere ale clienților? Care dintre riscurile identificate (tokeni în fișier, loguri fără retenție, fără firewall pe planul de control, fără backup programat) trebuie tratate ca incidente de securitate și care drepturi de notificare a persoanelor vizate se declanșează în cazul unei încălceri de date?"

---

### C-19 — Contracte cu procesatori (art. 28)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. **Nu există niciun registru de procesatori/sub-procesatori, niciun DPA, nicio listă publicată.** `grep -rliE "data processing agreement|contract de prelucrare|sub-processor"` → zero fișiere proprii.

**Ce procesatori sunt, de fapt, în arhitectură (`VERIFIED` pe `00-architecture.md` și pe host):**

| Procesator | Rol | Date probabile |
|---|---|---|
| **Pterodactyl / Wings** (VM 100/101) | panoul și nodul de execuție; conține contul clientului, cheile de acces, conținutul containerului | e-mail, nume, UUID-uri de server, conținut fișiere, adrese IP, chei de acces |
| **Stripe** | plățiți, abonamente, facturare | e-mail, nume, adresă de facturare, metadate de comandă, ID-uri de plată |
| **Cloudflare** | proxy și DNS pentru `blipmade.com` | adrese IP, agent de utilizator, `cf-*` headers, eventuale loguri |
| **Relay SMTP** (încă neconfigurat) | trimiterea e-mailurilor | e-mail, nume, conținutul mesajelor |
| **Keymint** (bridge-ul panelului) | emite chei de client pentru panou | UUID-uri, identificatori de utilizator |
| **Proxmox / furnizorul de hosting** | infrastructură | adrese IP, identificatori de instanță, eventuale loguri |

**Observație cu totul specială:** în prezent, **datele nu ajung la Stripe** (plățile sunt oprite) și **nici la Cloudflare** nu ajung date de clienți (doar traficul site-ului). Dar **Pterodactyl primește deja date de clienți astăzi** — inclusiv cheile de acces, generate prin bridge (`PANEL_KEYMINT_URL`/`PANEL_KEYMINT_SECRET` configurete, `VERIFIED`).

**Întrebare pentru profesional:**
> „Ce set de procesatori există în arhitectura reală (Pterodactyl/Wings, Stripe, Cloudflare, relay SMTP, keymint, furnizorul de hosting) și ce DPA trebuie încheiate cu fiecare, inclusiv cu sub-procesatorii lor? Ce se poate transfera către o țară din afara UE, ce mecanism de transfer (decizie de adeziune, clauze contractuale standard, garanții) este disponibil și ce evaluare de impact de transfer trebuie făcută? Ce drepturi trebuie garantate clienților, în special celor care își exercită dreptul la ștergere, în raport cu datele aflate la Pterodactyl?"

---

### C-20 — Notificarea încălcerii de date (art. 33)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există procedură de notificare, nu există registru de incidente de securitate, nu există mecanism de alertare. **Nu există niciun sistem de monitorizare externă** care să detecteze o încălcare (nici Prometheus, nici Alertmanager, nici Sentry — `CODE-INSPECTED`, vezi `11-support-and-operations.md` §3.5).

**Puncte de pregătire care există deja (`CODE-INSPECTED`):** `AuditLog` oferă urma **acțiunilor**, nu o alertă. `GET /admin/audit` permite filtrarea după acțiune, actor și perioadă — util pentru o investigație post-incident, dar **nu e detectie**.

**Întrebare pentru profesional:**
> „Ce procedură trebuie adoptată pentru detectarea, evaluarea și notificarea încălcerilor de date (termen de 72 de ore, conținutul notificării către autoritatea de control, conținutul comunicării către persoane vizate)? Care dintre evenimentele identificate în audit — de exemplu fișierele cu tokeni de resetare de parolă în text clar, accesibilibile în directorul de backup — constituie o încălcare de date care trebuie notificată, sau un risc de încălcare pentru care e suficientă remedierea preventivă?"

---

### C-21 — Registrul prelucrărilor, DPO, consultări

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există registru al prelucrărilor, nu există desemnare de DPO, nu există mecanism de consultare a persoanelor vizate, nu există politică de breșă.

**Întrebare pentru profesional:**
> „Operatorul trebuie să mențină un registru al activităților de prelucrare și să desemneze un DPO sau un responsabil, și are obligații de consultare a persoanelor vizate și de evaluare a impactului? Care este cea mai simplă formă documentară acceptabilă pentru un operator de această dimensiune, și cine o poate certifică în România (ANSPDCP)?"

---

### C-22 — Transferuri internaționale (art. 44–49)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Evidență:** `NOT-IMPLEMENTED`. Nu există în repo niciun mențiune despre transferuri, și **nu am verificat locul real de procesare al fiecărui furnizor** — pentru că asta cere un audit de contracte cu furnizorii, care nu e în sfera acestui audit tehnic read-only. În repo **există o listă de furnizori** (README §„third parties" — Stripe, Pterodactyl, Cloudflare, keymint, relay SMTP), dar **fără mențiune despre țara de procesare**.

**Întrebare pentru profesional:**
> „Pentru fiecare furnizor din lanț (Stripe, Pterodactyl/Wings, Cloudflare, relay SMTP, keymint, hosting), care este țara de procesare efectivă și ce mecanism de transfer se aplică? Este suficientă o clauză contractuală standard sau e necesară o evaluare de impact de transfer, și cine o redactează?"

---

### C-23 — Cookie-uri

**Status: `PARTIAL` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Ce există (`VERIFIED` / `CODE-INSPECTED`):**
- **Exact două cookie-uri**, ambele strict necesare: `bm_session` (`httpOnly`, `sameSite: 'lax'`, `secure` condiționat de protocol, TTL 14 zile) și `bm_csrf` (lizibil de JS, prin design, pentru echo-ul în `X-CSRF-Token`).
- **Niciun tracker terț**, nicio analitică, niciun pixel, niciun cookie de marketing (`VERIFIED` prin grep pe `web/src` și `web/index.html`).
- **Niciun banner de cookie** — și, pe baza inventarului de mai sus, **probabil corect**, dacă ambele cookie-uri sunt „strict necesare" pentru un serviciu cerut de utilizator.

**Ce lipsește (`NOT-IMPLEMENTED`):**
- **Nicio informație despre cookie-uri** în interfață: nu există niciun link, niciun tabel, nicio pagină. `grep` pe `web/src` → singurele apariții ale cuvântului „cookie" sunt în exemplele `curl` din `web/src/pages/Docs.tsx:1074-1080` și `:2062-2068`.
- **Nicio opțiune de a retrage consimțământul** — deși, dacă nu există cookie-uri ne-necesare, poate să nu fie aplicabilă.

**Întrebare pentru profesional:**
> „Platforma folosește doar două cookie-uri strict necesare (sesiune HttpOnly și token CSRF) și niciun tracker terț. Este suficient un tabel informativ despre cookie-uri fără banner și fără mecanism de refuz, sau este obligatoriu un consent manager, având în vedere că există și o componentă de comunicare comercială (newsletter) care ar necesita cookie-uri suplimentare?"

---

## 7. IP, porturi și abuz

### C-24 — Dreptul de folosire a resurselor, adreselor IP și a porturilor

**Status: `PARTIAL` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Ce există (`VERIFIED` / `CODE-INSPECTED`):**
- **Modelul de resurse e complet și corect anunțat înainte de plată**: RAM, vCPU, disk, cu preț calculat pe minimul produsului (`api/src/services/pricing.ts:39-53`) și cu o explicație limpede în wizard („The price of the smallest configuration is €1.49/mo. The amount above is the price of the configuration you chose." — `VERIFIED`).
- **Fiecare instanță are o alocare proprie** în panou (`Instance.pterodactylAllocation`), iar consumul se poate citi live (`GET /instances/:id/resources` → `memory_bytes`, `cpu_absolute`, `network.rx/tx`, `disk.used`).
- **Adresele IP sunt publice și DNAT-uite prin reguli explicite** (`03-network-and-ip-plan.md` §2 — `VERIFIED`).

**Ce lipsește (`NOT-IMPLEMENTED` / `VERIFIED`):**
- **Nu există limite per container aplicate** (`03-infrastructure.md` F-09 — `DOCUMENTED-ONLY`): un client poate consuma resursele fizice ale nodului. Nici pentru consumatori, nici pentru clienți plătitori.
- **Nu există limitare a traficului** (nici în panou, nici în cod) — și consumul de trafic nu e facturat și nu apare în modelul economic (`09-unit-economics.md`: „trafic | fix | 0.0000").
- **Nicio politică de reutilizare a adreselor IP** după ieșirea unui client.
- **Nicio limitare a numărului de instanțe** per cont.

**Întrebare pentru profesional:**
> „Ce obligații are operatorul de găzduire față de drepturile de proprietate ale clienților asupra datelor, a spațiului de stocare și a rezultatelor? Care este regimul corect pentru reutilizarea adreselor IP după ieșirea unui client, în ce termen și cu ce notificare? Ce limite tehnice de resurse și de trafic trebuie contractualizate pentru ca platforma să nu poată fi acuzată că promite un serviciu pe care nu îl poate onora?"

---

### C-25 — Politica de abuz și procesul de raportare

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Ce există (`CODE-INSPECTED`):** `TicketCategory.ABUSE` există în enum (`api/prisma/schema.prisma:695-701`) — deci **modelul de date preia o cerere de abuz**. Atât.

**Ce lipsește (`NOT-IMPLEMENTED` / `VERIFIED`):**
- **Nu există adresă de raportare a abuzului** — nici `abuse@`, niciun formular, nicio pagină (`VERIFIED` — grep pe `web/src`, `api/src`, `docs`).
- **Nu există procedură** de analiză, de suspendare sau de deconectare pentru abuz; deși există `POST /instances/:id/suspend` și `POST /admin/customers/:id/suspend`, **nu există un flux documentat care să le lege de o plângere de abuz** (`CODE-INSPECTED`).
- **Nu există registre de incidente de abuz** și nu există statistici.
- **Nu există niciun mecanism prin care un terț (de ex. un jucător victimizat, un deținător de drepturi) să ajungă la operator** în afara formularului de contact al unui client.

**Întrebare pentru profesional:**
> „Ce adresă și ce canal trebuie să existe pentru raportarea de abuz (obligatoriu unul de e-mail dedicat?), ce termen de reacție trebuie promis pentru o plângere de abuz, ce trebuie să se întâmple cu serverul și cu datele înainte de o decizie, și ce obligații de cooperare există în cazul unei cereri din partea unei autorități (notificări de abuz, cereri de identificare a utilizatorului)?"

---

### C-26 — Cereri de retragere a conținutului protejat (DMCA și echivalentul european)

**Status: `NOT-IMPLEMENTED` + `NEEDS-PROFESSIONAL-CONFIRMATION`**

**Context, formulat tehnic:** găzduirea de joc și de conținut este un caz tipic de „hosting intermediary". Ceea ce e necesar în practică: **o procedură scrisă** de tratare a notificărilor de încălcare a drepturilor (inclusiv pentru conținut generat de utilizatori — jocuri, moduri, hărți, servere private), cu termene, cu pași de verificare, cu o decizie documentată și cu mecanism de notificare a părților.

**Evidență:** `NOT-IMPLEMENTED`. Nu există:
- nicio procedură de takedown sau de reținere;
- nicio adresă de contact pentru cereri de încălcare;
- nicio rută de API pentru a reține sau a elibera conținut (inventarul complet al rutelor nu conține nimic relevant);
- **niciun mecanism de identificare a titularului de drepturi** — deși există `PanelCredential` și `pterodactylUserId`/`pterodactylExternalId` pe `User` (`CODE-INSPECTED`), deci **datele necesare ar exista**;
- **nicio retenție a conținutului pe o perioadă fixă** (vezi C-27) — deci o cerere ulterioară nu ar putea fi onest investigată.

**Nuanță specifică găzduirii de joc, importantă:** conținutul tipic al unui server de Minecraft sau Counter-Strike (hărți, configurații, plugin-uri, skin-uri) include conținut creat de terți, inclusiv material protejat de drepturi de autor și, uneori, conținut al cărui titular nu poate fi identificat. **Conținutul utilizatorului nu poate fi blocat la nivel de platformă fără un mecanism de notificare** — și în prezent, un asemenea mecanism nu există.

**Întrebare pentru profesional:**
> „Ce procedură de tratare a cererilor de încălcare a drepturilor trebuie adoptată pentru o platformă de găzduire cu conținut generat de utilizatori, care este termenul de reacție și de acțiune, ce trebuie să facă operatorul între primirea notificării și decizie (notificare către client, suspendare provizorie, reținerea probelor), ce se întâmplă cu datele găzduite la eliminare, și care este regimul aplicabil cererilor din afara UE (DMCA și echivalentul său european)?"

---

## 8. Retenția efectivă a datelor

### C-27 — Politica și implementarea retenției

**Status: `PARTIAL`** — **doar sesiunile au retenție automată.**

**Metodă:** am verificat fiecare tabel cu date personale din `api/prisma/schema.prisma` împotriva fiecărei operații de ștergere din `api/src/**` și a timerelor din `api/src/worker.ts`.

**Timerele workerului (singurele locuri unde se șterge ceva automat) — `CODE-INSPECTED` (`api/src/worker.ts`):**

| Timer | Frecvență | Ce face |
|---|---:|---|
| `reconcile` | 60 s | reconciliază instanțele cu panoul |
| `pruneQueue` | 10 min | curăță coada de joburi |
| `pruneSessions` | 1 h | **șterge sesiunile expirate** (`api/src/plugins/auth.ts:154-158`) |
| `sweepBilling` | 15 min | reînnoiri de abonamente |
| `retryWebhooks` | 5 min | reîncearcă webhook-urile Stripe |

**Tabelul complet al retenției (`CODE-INSPECTED` pe schemă + cod, `VERIFIED` pe numărul de rânduri):**

| Tabel | Date cu caracter personal | Curățare automată | Curățare manuală | Retenție efectivă |
|---|---|---|---|---|
| `Session` | `ip`, `userAgent`, `tokenHash` | ✅ `pruneSessions`, orar | — | **14 zile** (TTL) |
| `VerificationToken` | `tokenHash`, `expiresAt` | ❌ `verificationToken.deleteMany` **nu există** | ❌ | **nelimitată** — `VERIFIED`: 5 rânduri, **2 expirate**, 0 folosite |
| `MailDelivery` | `to` (adresă de e-mail), `kind` | ❌ | ❌ | **nelimitată** |
| `AuditLog` | `actorEmail`, `ip`, `meta` | ❌ `auditLog.deleteMany` **nu există** | ❌ `cleanup-data.sh` nu atinge logul | **nelimitată** — `VERIFIED`: 542 rânduri |
| `Ticket`, `TicketMessage`, `TicketEvent` | conținut, autor, `ip` | ❌ | ❌ | **nelimitată** |
| `Attachment` | fișierele încărcate de clienți | ❌ | ❌ | **nelimitată** |
| `Order`, `OrderItem` | adresă de e-mail, sume, `config` | ❌ | ❌ | **nelimitată** |
| `Invoice`, `Subscription`, `Payment` | adresă, sume | ❌ | ❌ | **nelimitată** (0 rânduri acum) |
| `Instance`, `InstanceEvent`, `InstanceDomain` | conținut, evenimente, domenii | ❌ | ❌ | **nelimitată** |
| `PanelCredential` | cheia de acces la panou | ❌ | doar la `forgetCustomerCredential()` | **nelimitată** |
| `EmailChangeRequest` | adresă nouă, `tokenHash` | ❌ | `deleteMany` **doar** la o cerere nouă pentru același utilizator (`settings.ts:252`) — **nu e retenție** | **nelimitată** |
| `PromotionRedemption` | utilizator, cod | ❌ | parțial — `releasePromotionReservation()` la anularea unei comenzi (`pricing.ts:258`) și curățarea rezervărilor vechi (`billing.ts:287`); **nicio ștergere la expirarea perioadei de promoție** | **nelimitată** (`VERIFIED`: 0 rânduri acum) |
| **`User`** | **e-mail, nume, hash de parolă** | ❌ **nu există nicio ștergere** | ❌ **nu există nicio unealtă** | **nelimitată** — vezi C-15 |
| **Fișierele de e-mail** | adresă + corp integral + token | ❌ | ❌ | **4 270 fișiere** — și `backup.sh` nu le atinge: regula de curățare e `find "$BACKUP_DIR" -maxdepth 1 -name "blipmade-*.tar.gz" -mtime "+$KEEP_DAYS" -delete` (`scripts/backup.sh:58`), deci **exclusiv arhivele de backup** |
| **Arhivele de backup** | `pg_dump` = **întreaga bază de date cu date personale** | ✅ `KEEP_DAYS` = 14 zile, dar **doar** pentru `blipmade-*.tar.gz` | ❌ | 14 zile, local, **fără copie externă** (`OFFSITE_TARGET` neconfigurat — `03-infrastructure.md` §9.2) |

**Concluzia retenției, într-o propoziție:** *singura retenție automată din întreaga platformă este sesiunea de 14 zile; toate celelalte categorii de date personale — inclusiv conturile în sine, tokenii de resetare de parolă, jurnalul de audit cu adrese IP, ticketurile și conținutul fișierelor — se acumulează la nesfârșit, fără nicio politică declarată și fără nicio unealtă care să le elimine.*

**Caz particular, verificabil: reținerea la anulare.** Există în cod o **comutare** pentru ștergerea automată a serverului unui abonament anulat — `autoDeleteEnabled()`, `api/src/services/billing.ts:29-34`:

```ts
const setting = await prisma.setting.findUnique({ where: { key: 'auto_delete_cancelled_instances' } });
if (!setting) return false;
```

**Valoarea implicită, când comutarea nu există, este `false`** — deci serverul **NU** se șterge. Iar tabelul `Setting` are **0 rânduri** (`VERIFIED`), deci comutarea nu e setată deloc. Rezultatul: un client care anulează abonamentul își lasă **serverul, containerul și datele pe nod, fără termen**, până când cineva intervine manual — și nu există niciun instrument care să o facă. Acesta este și constatarea `COMM-08` din `12-FULL-FINDINGS-REGISTER.md`; o semnalez aici pentru că are consecință directă de conformitate (§C-15, §C-27, §C-28).

**Consecință asupra C-15 (ștergerea):** chiar și dacă s-ar implementa azi `prisma.user.delete`, **ștergerea ar fi incompletă**, pentru că: (a) `AuditLog` ar rămâne (corect, dar nedecarat); (b) **4 270 fișiere de e-mail ar rămâne**, cu tokeni și adrese; (c) **arhivele de backup ar conține în continuare datele șterse**; (d) **datele din panoul Pterodactyl ar rămâne**, pentru că ștergerea din Blipmade nu șterge contul de pe panou (`PanelCredential` e legat de utilizator, dar contul de panou e un obiect separat).

**Întrebare pentru profesional:**
> „Ce termene de păstrare ar fi rezonabile și defendabile pentru: conturi inactive, tokeni de verificare/resetare, jurnalul de audit cu adrese IP, ticketuri și mesaje, comenzi și facturi, conținut de fișiere și copii de backup? Care dintre acestea trebuie păstrate pentru obligații contabile sau fiscale și pe ce termen, iar pentru celelalte trebuie să existe o ștergere automată, și cum se documentează că o cerere de ștergere a fost executată *efectiv*, inclusiv în arhivele de backup și în sistemele terțe (Pterodactyl, Stripe)?"

---

### C-28 — Dreptul de ștergere în materialul de backup

**Status: `NOT-IMPLEMENTED`**

**Evidență:** `VERIFIED` — `scripts/backup.sh:38` face `pg_dump` al întregii baze de date (care conține toate datele personale) și o arhivează în `BACKUP_DIR = /var/backups/blipmade` (`VERIFIED` din `.env`), cu retenție de 14 zile (`BACKUP_KEEP_DAYS`, default 14). Nu există un mecanism de „ștergere selectivă din backup" și nu poate exista unul într-un dump PG. Plus că **nu există backup programate** (`03-infrastructure.md` §9.1) și **nu există copie externă** (`OFFSITE_TARGET` neconfigurat) — deci, în practică, **singurele copii ale datelor sunt cele locale, nearsate**.

**Întrebare pentru profesional:**
> „Cum trebuie tratat dreptul de ștergere față de arhivele de backup: există un termen rezonabil în care o copie poate conține date șterse, ce declarație trebuie făcută în politica de confidențialitate despre acest lucru, și ce obligații de ștergere apar atunci când arhivele sunt criptate și păstrate offsite, cu chei aflate la un alt furnizor?"

---

### C-29 — Ecrane de conformitate vizibile în interfață

**Status: `NOT-IMPLEMENTED`**

**Evidență:** `VERIFIED` — inventarul complet al rutelor web (`web/src/routes.tsx:85-121`) nu conține nicio rută de tip `/terms`, `/legal`, `/privacy`, `/cookies`, `/imprint`, `/abuse`, `/dpa`. Footer-ul (`web/src/home/Rest.tsx:62-66`) are doar: Apps · Pricing · Docs · Status · Log in/Dashboard. `web/public/` conține doar `favicon.svg` și `fonts/`.

**Ce ar trebui, în interfață (propunere, nu cerință legală formulată de mine):** un footer cu linkuri către Termeni, Confidențialitate, Cookie-uri, Contact, plus un punct de contact pentru abuz — și un paragraf de identitate a operatorului în Subsolul paginii de contact.

---

## 9. Ce am verificat și nu am putut verifica

| Limită | Efect |
|---|---|
| Nu am consultat registre publice (Registrul Comerțului, ANAF, monitorul oficial) | Forma juridică, CUI-ul, sediul, cifra de afaceri, încadrarea fiscală: `BLOCKED` (C-12) |
| Nu am citit contractele cu furnizorii (Stripe, Pterodactyl, Cloudflare, keymint) | DPA-urile existente, țările de procesare, clauzele de transfer: `BLOCKED` (C-19, C-22) |
| Nu am verificat configurația DNS (SPF/DKIM/DMARC) pentru `blipmade.com` | Conformitatea e-mailului: `BLOCKED` (C-08, C-09) — și irrelevantă cât timp SMTP nu e configurat |
| Nu am putat trimite un e-mail de test (audit read-only) | Livrarea reală nu a fost testată niciodată: `BLOCKED` |
| Nu am evaluat conținutul efectiv al containerelor clienților (doar fișierele la rădăcina unuia) | Politica de retenție a conținutului: `UNVERIFIED` |
| Am citit schema Prisma și codul, nu o bază de date cu clienți reali | Nu există clienți reali: toate rândurile sunt din fereastra de audit (`VERIFIED`) |
| Nu am făcut o analiză de conformitate a CUI-ului/DPIA | `NEEDS-PROFESSIONAL-CONFIRMATION` |

---

## 10. Ordinea de remediere, din punct de vedere al conformității

Ordinea urmărește **blocajele tehnice**, nuGDPR-ul în sine: majoritatea elementelor legale nu se pot activa înainte ca platforma să aibă plăți, e-mail și o cale de ștergere.

| # | Remediere | Deblochează | De ce e aici |
|---|---|---|---|
| **F1** | **Scrie și publică Condițiile generale, Politica de confidențialitate, AUP, politica de cookie-uri și pagina de contact** (cu identitatea completă a operatorului) | C-01, C-02, C-03, C-04, C-13, C-23, C-29 | Este **singura** remediere care deblochează 7 elemente simultan, și nu necesită nicio modificare de cod — doar texte și un footer |
| **F2** | **Implementează ștergerea reală a contului** (`prisma.user.delete` + unealtă de operare + curățarea fișierelor de e-mail și a datelor din panou) | C-15, C-16, C-28 | Fără ea, cererea de ștergere e o simplă marcare. E lacuna cea mai gravă |
| **F3** | **Configurează SMTP** + SPF/DKIM/DMARC | C-07, C-08, C-09 | Deblochează resetarea parolei, **și** notificările de ticket (→ `11-support-and-operations.md`) |
| **F4** | **Definește o politică de retenție și implementează joburile de curățare** (tokeni, audit, mail, ticketuri, comenzi) | C-27, C-28 | Astăzi doar sesiunile au retenție |
| **F5** | **Implementează facturarea cu TVA** (câmpuri de identitate fiscală, cotă, loc de stabilire, tipuri de document) | C-10, C-11, C-12 | Fără plăți nu există factură; fără factură nu există conformitate fiscală |
| **F6** | **Încheie DPA-urile și ține registrul procesatorilor** | C-19, C-21, C-22 | Necesitate independentă de orice remediere tehnică |
| **F7** | **Scrie procedura de abuz și de takedown**, cu adresă dedicată și cu retenție a conținutului pe o perioadă fixă | C-25, C-26 | Text + o rută de reținere a conținutului |
| **F8** | **Limitează resursele per container și traficul** | C-24 | Protejează și platforma (risc de nod suprasolicitat), și clientul (așteptări realiste) |
| **F9** | **Creează procedura de incident și de notificare a încălcerii** | C-20, C-18 | Merge mână în mână cu `11-support-and-operations.md` §6 |

---

*Document scris de agentul A11. Toate afirmațiile tehnice au clasă de evidență și sunt urmărite la o sursă concretă (fișier:linie sau ieșire de comandă). Elementele legale și fiscale sunt marcate `NEEDS-PROFESSIONAL-CONFIRMATION` și **nu reprezintă consult juridic sau fiscal**. Nu conține secrete, date personale ale clienților sau cifre fabricate.*
