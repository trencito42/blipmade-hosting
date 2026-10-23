# 06 — Backlog de îmbunătățire UX/UI

**Data:** 2026-10-23 · ordonat după **severitate × frecvență × efort**.

Regula de ordine: un S1 care lovește fiecare client în fiecare zi stă deasupra unui S3 pe o singură pagină; între două probleme de aceeași severitate, problema care apare pe mai multe rute stă înainte; între două probleme cu aceleași severitate și frecvență, problema cu efort mai mic stă înainte.

Efort: **S** = sub o oră · **M** = o zi · **L** = mai mult de o zi.

Clasele de verificare: `VERIFIED` = măsurat pe sistemul care rulează; `CODE-INSPECTED` = citit în sursă.

---

## 1. Tabelul priorizat

| # | Sev | Rută | Problemă | Efort | Tip |
|---|---|---|---|---|---|
| **UX-01** | **S1** | 9 rute, 22 de tabele | `DataTable`: `<tbody class="grid">` strică modelul de tabel — antetul nu se aliniază cu corpul (decalaj 105–562 px) | M | componentă |
| **UX-02** | **S1** | `/app/instances/:id` | Antetul spune „No public URL yet", dar adresa `10.77.0.11:30001` există și e în tabul „Network" | S | local |
| **UX-03** | **S1** | `/app/instances/:id` | „Online" (pastilă) și „Container: offline" (metrici) pe același ecran | S | local |
| **UX-04** | **S1** | `/admin/services` | Staff-ul nu poate inspecta o instanță: nicio rută, niciun link; adresa de client răspunde 404 | L | rută nouă |
| **UX-05** | **S1** | tot ce trece prin plată | `503 payments_unavailable` blochează checkout-ul, comanda, subscripția și domeniul | — | produs |
| **UX-06** | **S2** | `/`, `/apps` | Catalogul e cerut de **5 ori** pe pagina de pornire | S | o funcție |
| **UX-07** | **S2** | `/apps` | Starea de încărcare a catalogului arată ca un catalog gol (8 carduri goale) | S | CSS + componentă |
| **UX-08** | **S2** | 13 rute de staff | Butonul „Retry" al stării de acces interzis te duce în panoul client | S | componentă |
| **UX-09** | **S2** | 20 de pagini, 63 de elemente | `--ink-3` (`#7b827b`) nu trece 4.5:1 pe `--s2` (4.31), `--s3` (3.80), `--acc-bg` (3.92) | **S** | **o linie de CSS** |
| **UX-10** | **S2** | dialog + panou staff | Alb pe `--bad` = 2.78:1; `--ink` pe `--bad` = 2.55:1 | **S** | **o linie de CSS** |
| **UX-11** | **S2** | `/app/deploy/:slug` | Formularul nu are câmp pentru imagine, comandă și variabile de mediu | M | componentă |
| **UX-12** | **S2** | `/app/*` | Zona de client nu cere rolul: staff-ul vade contul lui de client, gol | S | local |
| **UX-13** | **S2** | `/admin/staff` | 42 de casete de permisiuni la 16×16 px (sub 24×24) | **S** | **o clasă** |
| **UX-14** | **S2** | `/app/billing` | „CURRENT PERIOD ENDS —": câmpul există, valoarea e `null` | S | local |
| **UX-15** | **S2** | `/app` | Panoul nu avertizează că adresa de e-mail nu e verificată (textul există doar în Setări) | M | componentă nouă |
| **UX-16** | **S3** | `/app/settings` | 5 casete de notificare fără legătură etichetă↔input | S | local |
| **UX-17** | **S3** | 6 rute | Ținte de 20–23 px (linkuri de text) | **S** | **o clasă** |
| **UX-18** | **S3** | tot arborele | 42 de blocuri de eroare, două nuanțe de roșu (`bg-bad/10` și `bg-bad/12`) | S | token + `sed` |
| **UX-19** | **S3** | tot arborele | Butonul periculos are trei reprezentări | S | token |
| **UX-20** | **S3** | `/`, `/apps` | Cele două câmpuri de căutare n-au indicator de focus | **S** | **o clasă** |
| **UX-21** | **S3** | `/admin/pricing` | Câmpurile poartă id-ul intern în hash (`base-cmvjyo5yh0003dxtl58rz6pjt`) | M | local |
| **UX-22** | **S3** | tot arborele | `prefers-reduced-motion` oprește 47 de elemente din 213; 166 continuă să animeze | S | CSS |
| **UX-23** | **S4** | tot arborele | Nu există `Alert`/`Banner`, `Tabs`, `Progress`, `DateFormat`, `Card`, `Checkbox` | M | design system |
| **UX-24** | **S4** | tot arborele | Blocul `@font-face` Proxima Nova → trei 404 la fiecare încărcare | S | CSS |
| **UX-25** | **S4** | `/register` | Mesajul de refuz nu spune care câmp e greșit | S | local |
| **UX-26** | **S4** | `/app/tickets/:id` | Atașamentul trimite doar numele, mărimea și tipul, nu conținutul | M | backend gata |
| **UX-27** | **S4** | tot arborele | 5 raze de card, 3 formate de dată, fără token | M | design system |
| **UX-28** | **S4** | tichete | Nu se poate șterge un ticket (nici endpoint, nici buton) | L | backend |

---

## 2. Câștigurile rapide — o linie de CSS, o clasă, o funcție

Cel mai bun raport impact/efort. Toate sunt măsurate și au un fix identificat.

### UX-09 · `--ink-3` nu trece contrastul

**Fișier:** `web/src/index.css:49` · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

`--color-ink3: #7b827b` dă **4.31:1** pe `--s2` (`#1a1d1a`), **3.80:1** pe `--s3` (`#232823`) și **3.92:1** pe `--acc-bg` (`#12291b`). Pragul AA este 4.5:1.

**Toate cele 63 de elemente de text aflate sub prag, pe 20 de pagini, au aceeași culoare.** Nu există nicio altă pereche de culori care să eșueze: 56 de elemente pe `s2`, 4 pe `s3`, 3 pe `acc-bg`, **zero** în rest. Afectează inclusiv „Services", „/ month", „23 Oct 2026", „No public URL yet", „Coming soon", antetele de tabel (`th` cu `text-ink3`).

**Fix (o linie):**
```css
--color-ink3: #8a9090;   /* era #7b827b */
```
`#8a9090` păstrează aceeași nuanță (decalare +6/+6 pe roșu și verde) și dă **5.24** pe `s2`, **4.63** pe `s3`, **4.76** pe `acc-bg`, **6.11** pe `bg`. `VERIFIED` (rapoartele calculate).

**Cum se verifică:** rulează `audit/_tools/a11y-measure.mjs`; coloana „contrastFails" din ieșire trebuie să fie 0 pe toate cele 30 de pagini.

### UX-10 · Text alb pe roșu

**Fișiere:** `web/src/ui-app.tsx:894` (toastul de eroare), `web/src/ui-app.tsx:1023` (butonul de confirmare), `web/src/admin/Overview.tsx:192` (butonul periculos din panou) · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED` (măsurat cu dialogul deschis, `audit/screenshots/a11y-confirm-dialog.png`)

`#ffffff` pe `#ff6b6b` = **2.78:1**; `#f3f6f2` pe `#ff6b6b` = **2.55:1**. Pragul AA este 4.5:1.

**Fix:**
```css
--color-on-bad: #2b0608;   /* 7.34:1 pe --bad */
```
și `text-on-bad` în loc de `text-white` / `text-ink` pe `bg-bad`.

### UX-13 · Casetele de permisiuni la 16×16

**Fișier:** `web/src/admin/Staff.tsx` · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

42 de `input[type=checkbox].size-4` (16×16). WCAG 2.2 AA 2.5.8 cere 24×24.

**Fix (o clasă):** `size-4` → `size-6`. Alternativ, `size-5` + `p-1.5` pe `<label>`, care e deja `flex min-h-[38px] items-center gap-2 rounded-xl` — deci ținta reală ar crește fără să încapă greșit.

### UX-17 · Țintele mici

**Fișiere:** `web/src/app/Overview.tsx:307`, `web/src/app/InstanceDetail.tsx` (linkul „Instances"), `web/src/app/ProductPage.tsx:147`, `web/src/home/Catalog.tsx` (numele produsului), `web/src/home/Studio.tsx` · **Severitate:** S3 · **Efort:** S · **Verificare:** `VERIFIED`

Măsurate: 20 px, 21 px, 23 px, 23 px, 24 px.

**Fix (o clasă):** `py-1` pe linkurile de text; acestea trec la 28 px.

### UX-20 · Câmpurile de căutare fără indicator de focus

**Fișiere:** `web/src/home/Catalog.tsx:123-127`, `web/src/home/Studio.tsx:147-151` · **Severitate:** S3 · **Efort:** S · **Verificare:** `VERIFIED`

Inputul are `outline-none`, iar containerul `<label>` are doar `focus-within:bg-s3` — o schimbare de fundal, fără inel. WCAG 2.4.7 Focus Visible.

**Fix (o clasă):** pe `<label>`, `focus-within:ring-2 focus-within:ring-acc` — exact idiomul din `web/src/pages/auth-field.tsx:44` (`focus-within:ring-acc`), care funcționează.

### UX-06 · Catalogul cerut de cinci ori

**Fișier:** `web/src/lib/pricing.ts:31-38` · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

5 apeluri identice `GET /api/catalog/products` pe `/`. Cache-ul de module memorează rezultatul, nu promisiunea în curs.

**Fix:** `load()` să memoreze promisiunea (codul complet în `06-ux-ui-complete.md`, UX-05). 5 apeluri → 1.

### UX-12 · Zona de client nu cere rolul

**Fișier:** `web/src/routes.tsx:123-160` (componenta `Guard`) · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

**Fix:** când `area === 'customer'` și `isStaff(user.role)`, `navigate('/admin')`.

### UX-08 · Butonul „Retry" care nu reîncearcă

**Fișier:** `web/src/ui-app.tsx:509-545` · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

**Fix:** prop `actionLabel` pe `ErrorState` (implicit „Retry"); gardul trece `actionLabel="Back to your dashboard"`.

### UX-22 · Mișcarea nu e oprită complet

**Fișier:** `web/src/index.css:183-187` · **Severitate:** S3 · **Efort:** S · **Verificare:** `VERIFIED`

Cu `prefers-reduced-motion: reduce`, 166 de elemente continuă să animeze (utilitarele Tailwind `duration-[180ms]`, `duration-[220ms]`, inclusiv `transition-transform` pe indicatorul navigației și `active:scale-[0.97]` pe butoane).

**Fix:** adaugă în blocul `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

### UX-24 · Proxima Nova: trei 404 la fiecare încărcare

**Fișier:** `web/src/index.css:15-35` · **Severitate:** S4 · **Efort:** S · **Verificare:** `VERIFIED` (`GET /healthz` → `installed:false`)

**Fix:** fie se publică fișierele, fie se scoate blocul `@font-face` și rămâne doar fallback-ul „Geist Variable". Recomandarea e scoaterea: interfața arată identic (font-display: swap) și se pierde traficul inutil.

---

## 3. Schimbări de componentă

### UX-01 · Tabelele nu-și aliniază antetul cu corpul

**Fișier:** `web/src/ui-app.tsx:1035-1075` (`DataTable`) · **Severitate:** S1 · **Efort:** M · **Verificare:** `VERIFIED`

`<tbody className="grid gap-1.5">` scoate corpul din modelul de tabel. Antetul e calculat de browser pe lățimea maximă a oricărei celule; fiecare rând are coloane auto-dimensionate. Decalajul măsurat: **105 px** (`/admin/tickets`), **301 px** (`/admin/services`), **345 px** (`/app/tickets`), **393 px** (`/admin/products`), **424 px** (`/admin/customers`), **420 px** (`/admin/staff`), **499 px** (`/admin/orders`), **557 px** (`/app/instances`), **562 px** (`/admin/audit`).

Rândul real al ticketului #42 (subiect de 100 de caractere) iese cu **479 px** din cutia lui, iar fundalul rândului se oprește în mijlocul conținutului.

**Fix:** `border-separate border-spacing-y-1.5` pe `<table>`, `<tbody>` fără `grid`, plus `max-w-[22rem] truncate` pe celula de text lung. Codul complet în `06-ux-ui-complete.md`, §1.4.

**Cum se verifică:** rulează `audit/_tools/tablescope.mjs`; coloana „maxHeaderOffset" trebuie să fie **0** pe toate cele 9 rute. Apoziția fiecărei celule de antet trebuie să coincidă cu cea a celulei de același rând.

### UX-02 · Adresa instanței nu se vede

**Fișier:** `web/src/app/InstanceDetail.tsx:675-685` · **Severitate:** S1 · **Efort:** S · **Verificare:** `VERIFIED`

`GET /api/instances/:id/allocations` → `{"allocations":[{"ip":"10.77.0.11","port":30001,"alias":"node1.blipmade.com","is_default":true}]}`. Adresa e afișată doar în tabul „Network", al șaselea dintre douăsprezece. Antetul spune „No public URL yet", calculat de `api/src/routes/instances.ts:33-36` **doar** dintr-un domeniu `ACTIVE`.

**Fix:** în antet, adaugă rândul de alocare primară ca text secundar (`text-ink2`, `text-[13px]`), cu un `Link` spre tabul „Network"; redenumește „No public URL yet" în „No public domain yet" și adaugă o explicație într-un rând („The address below reaches the service directly.").

### UX-03 · Două stări contrazicătoare

**Fișier:** `web/src/app/InstanceDetail.tsx` (antet) și `web/src/app/instance/OverviewTab.tsx` (metrici) · **Severitate:** S1 · **Efort:** S · **Verificare:** `VERIFIED`

**Fix:** când `metrics.state !== 'online'`, pastila din antet să reflecte starea containerului, iar sub ea o linie „Provisioned {date} · the container reports {state}." — cu `text-ink2`.

### UX-07 · Catalogul arată gol în încărcare

**Fișier:** `web/src/home/Catalog.tsx:130-142` · **Severitate:** S2 · **Efort:** S · **Verificare:** `VERIFIED`

8 dreptunghiuri goale, identice cu 8 carduri goale. Timpul real: 523–596 ms.

**Fix:** fie `LoadingBlock rows={3} label="Loading the catalog"` (există deja, `ui-app.tsx:473`), fie `Skeleton` cu `animate-pulse` și `aria-label`.

### UX-11 · Parametrii de pornire lipsesc din formularul de deploy

**Fișier:** `web/src/app/Deploy.tsx:412-540` · **Severitate:** S2 · **Efort:** M · **Verificare:** `VERIFIED` (câmpurile absente) + `CODE-INSPECTED` (`app/instance/StartupTab.tsx` există și are „Docker image" și „Startup command")

Clientul plătește pentru o instanță înainte să poată alege ce rulează în ea.

**Fix:** în pasul 1 al vrăjitorii, trei câmpuri noi: imaginea Docker (`Select` cu imaginile disponibile), comanda de pornire (`TextInput`) și variabilele de mediu (o listă de perechi cheie/valoare, cu `TextInput`); prețul se recalculează ca acum.

### UX-15 · Avertisment pentru adresa neverificată

**Fișier:** `web/src/app/Overview.tsx` · **Severitate:** S2 · **Efort:** M · **Verificare:** `VERIFIED`

Textul „Not verified" există în `app/Settings.tsx`, nu și în panou.

**Fix:** un bloc nou în `Overview.tsx`, cu `role="status"`, `bg-acc-bg` + `text-acc` (raport 9.78:1), un `Link` spre `/app/settings` și butonul „Resend the verification mail" (endpointul există).

### UX-23 · Componentele care lipsesc

**Severitate:** S3 · **Efort:** M · **Verificare:** `CODE-INSPECTED` (căutare pe tot arborele `web/src`)

Nu există: `Alert`/`Banner`, `Tabs`, `Progress`, `DateFormat`, `Card`, `Checkbox`, `Tooltip`, `Pagination`, `Breadcrumb`, `Spinner`, `Modal`/`Dialog` de bază, `Copy`.

Consecințe concrete: 42 de blocuri de eroare copiate manual (UX-18); 12 taburi fără comportament de tastatură unitar; 5 casete de notificare fără componentă (UX-16); trei formate de dată (UX-27).

**Fix:** creează `Alert` (cu `tone: 'info' | 'ok' | 'warn' | 'bad'`), `Tabs`, `DateFormat` și `Checkbox` în `web/src/ui-app.tsx`, apoi migrează paginile care le-au nevoie.

---

## 4. Probleme de produs și de backend

Nu sunt UX, dar blochează clientul mai tare decât orice problemă de interfață.

### UX-05 · Zidul de plată

`POST /api/orders/:id/checkout` → **503 `payments_unavailable`** („no Stripe key is configured on this environment"). `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol. `GET /api/health` → `"stripe":"not_configured"`.

**De ce contează:** blochează comanda, plata unei facturi, subscripția, domeniul (deci adresa publică, vezi UX-02) și orice upgrade.

**De blocare:** `STRIPE_SECRET_KEY` real + `PAYMENTS_ENABLED=true` + webhook-ul Stripe configurat. Până atunci, interfața ar trebui să spună explicit clientului că plata nu este disponibilă, în loc să arate o eroare tehnică.

### UX-26 · Atașamentul de tichetă trimite doar metadatele

**Fișier:** `web/src/app/TicketDetail.tsx:295-305` · **Severitate:** S4 · **Efort:** M · **Verificare:** `CODE-INSPECTED`

Interfața spune corect: „Only the file name, size and type are sent with your reply — the file contents are not uploaded from this form." Dar **tabelul `Attachment` există** în schemă (`api/prisma/schema.prisma:827`, cu `storageKey` și `sha256`) și **endpointul există** (`POST /api/tickets/:id/attachments`, `api/src/routes/tickets.ts:314`). Backend-ul e gata; interfața nu îl folosește.

**Fix:** la alegerea fișierului, încarcă-l la `POST /tickets/:id/attachments` și trimite `attachmentId` în răspuns.

### UX-28 · Tichetele nu se pot șterge

**Severitate:** S4 · **Efort:** L · **Verificare:** `CODE-INSPECTED`

Nu există `DELETE /api/tickets/:id` și niciun buton. Auditul a lăsat un ticket („Audit journey probe 2026-10-23", #48) pentru că nu putea fi șters.

**De blocare:** un endpoint de ștergere cu `role = STAFF`, plus un buton cu `ConfirmDialog` în interfața de staff.

### UX-04 · Staff-ul nu poate inspecta o instanță

**Fișier:** `web/src/routes.tsx:85-121`, `web/src/admin/Services.tsx` · **Severitate:** S1 · **Efort:** L · **Verificare:** `VERIFIED`

`/admin/services` listează 3 servicii, cu coloana „PTERODACTYL ID" și o acțiune „Retry provisioning", dar **niciun link către instanță**; singurele linkuri de pe pagină sunt către clienți. Nu există rută `/admin/services/:id`. Singurul URL de instanță e în zona de client, unde `loadInstance(user.id, id)` aplică deținerea și răspunde **404** pentru staff.

**Fix:** rută nouă `/admin/services/:id` cu un component care citește instanța printr-un endpoint de staff (`GET /api/admin/services/:id`), plus linkul din tabel.

---

## 5. Ordinea de atac, în trei tranșe

**Tranșa 1 — o zi, fără schimbare de comportament** *(UX-09, UX-10, UX-13, UX-17, UX-20, UX-06, UX-12, UX-08, UX-22, UX-24)*: toate sunt o linie de CSS, o clasă sau o funcție. Rezolvă 86 de elemente de text sub contrast, două butoane inaccesibile, 42 de ținte prea mici, două câmpuri fără focus, patru apeluri de rețea redundante și un buton care minte.

**Tranșa 2 — o săptămână, schimbare de componentă** *(UX-01, UX-02, UX-03, UX-07, UX-11, UX-15, UX-23)*: tabelele (22 de tabele, 9 rute), adresa și stările instanței, catalogul în încărcare, parametrii de pornire, avertismentul de e-mail, componentele de bază.

**Tranșa 3 — după deblocarea plăților** *(UX-05, UX-04, UX-26, UX-28)*: nu poate fi atacată din interfață. Singurul lucru care se poate face acum e ca interfața să spună clar „Payments are not available at the moment", în loc de un mesaj tehnic.

---

## 6. Ce a rămas nerezolvat de măsură

| Problemă | De ce |
|---|---|
| Conținutul fișierului atașat la tichetă | scriere pe contul real; interfața spune corect că nu se trimite |
| Fluxul de deploy până la provisionare | creează o comandă și scrie în baza de date |
| Plata unei facturi | zidul de plată |
| Schimbarea profilului, a adresei de e-mail, a parolei | scriere în baza de date |
| Deconectarea de peste tot | ar încheia și sesiunea auditului |
| Ștergerea ticketului creat de audit | nu există endpoint |
| Costul real al celor 5 apeluri la catalog | măsurat ca număr de apeluri, nu ca timp de încărcare |
| Trimiterea mailului de confirmare | transportul e `file`, `configured:false` |
