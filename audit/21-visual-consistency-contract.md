# 21 — Contractul de consistență vizuală

Revizie de a doua rundă, auditor A22. Secțiunea 7 a brief-ului.

Acesta **nu** este un document de redesign. Este contractul pe care interfața existentă îl respectă în majoritatea
locurilor, scris într-un singur loc, cu abaterile măsurate de la el. Identitatea vizuală a Blipmade se păstrează:
un singur accent verde, suprafețe aproape-negrui, butoane-pill, un inel verde de focus, text albastru-verzui pe
verde. Nu se propune niciun gradient, nicio umbră, nicio mărire, nicio spațiere nouă.

## Metodă

- **Cod:** arborele de lucru `/root/blipmade-work`, citit la **23 octombrie 2026, 20:54 UTC** (instantane în
  `/tmp/snap`, ca numerele de linie să fie verificabile). **Atenție:** arborele de lucru diferă de buildul live
  `3948f7f` de pe VM 103; pentru fiecare abatere se spune în ce stare este.
- **Runtime:** stiva izolată `http://10.77.0.13:30003` (copie în `/tmp` pe VM 103, baza `blipmade_test`), Chromium
  prin `playwright-core`. Măsurătorile sunt `getComputedStyle` și `getBoundingClientRect` peste paginile deja
  servite, la 1280×900. Rutele măsurate: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/apps`,
  `/app`, `/app/instances`, `/app/domains`, `/app/billing`, `/app/tickets`, `/app/settings`, `/docs`, `/status`.
- **Documentele de referință citite înainte:** `audit/06-design-system.md` (tokenurile, componentele, §6
  „Consistența", §7 inventarul `DS-01`…`DS-15`), `audit/06-ux-ui-complete.md`, `audit/12-FULL-FINDINGS-REGISTER.md`
  (grupul `UX-01`…`UX-28`). Abaterile deja cunoscute sunt **referențate, nu repetate**; în tabelul de mai jos se
  vede starea lor în codul curent.
- **Stare a constatărilor existente în codul curent:** `UX-01` (grila pe `<tbody>` în `DataTable`) — **corectat**
  în `3948f7f` (`web/src/ui-app.tsx:1036-1093`: `border-separate`, `colgroup`, `borderSpacing: '0 6px'`); `DS-07`
  (trei reprezentări ale butonului periculos) — **încă prezent** (`web/src/ui-app.tsx:895` toast,
  `:1024` dialog, `web/src/admin/Overview.tsx:193`); `DS-10`/`UX-21` (două nuanțe de roșu `bg-bad/10` vs
  `bg-bad/12`) — **încă prezent**; `DS-11`/`UX-21` (razele de card) — **încă prezent**; `DS-12`/`UX-21` (trei
  formate de dată) — **încă prezent**; `DS-06`/`UX-23` (lipsesc `Alert`, `Tabs`, `Progress`, `DateFormat`,
  `Card`, `Checkbox`) — **încă prezent**; `DS-01`/`UX-09` și `DS-02`/`DS-03`/`UX-10` (contrastul) — **încă
  prezent**.

## Contractul

Fiecare tabel de mai jos dă: **regula**, **de unde vine** (fișier:linie în codul curent) și **cum trebuie să fie**
(formularea ce poate fi verificată).

### 2.1 Antetul paginii

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Un singur `<h1>` pe pagină, în coaja aplicației, nu în conținut | `web/src/ui-app.tsx:121` (`AppShell`), `:246` | Nicio pagine nu își scrie propriul `<h1>`; titlul vine din `ROUTES` (`web/src/routes.tsx:107-125`) |
| Mărimea titlului: 19 px pe telefon, 22 px de la `sm` | `web/src/ui-app.tsx:246` (`text-[19px] … sm:text-[22px]`) | Măsurat pe toate rutele din zonă: `h1` unic, `font-size: 22px` la 1280 px |
| Subtitlul: 13 px, `text-ink3`, trunchiat | `web/src/ui-app.tsx:247` | Subtitlul e opțional și nu încape pe două rânduri |
| Bara e lipicioasă, cu `pt` sigur pentru decupajul telefonului | `web/src/ui-app.tsx:235` | `sticky top-0`, `pt-[max(0.75rem,env(safe-area-inset-top))]` |
| Acțiunile din dreapta cresc la 44 px pe telefon | `web/src/ui-app.tsx:251` (`[&_a]:min-h-11 lg:[&_a]:min-h-0`) | Nicio acțiune din antet nu are o țintă sub 44 px pe telefon |

### 2.2 Layoutul cardurilor

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Secțiunea de conținut este un `Panel`: rază 22 px, `p-4`/`sm:p-5`, fundal `bg-s1` | `web/src/ui-app.tsx:373-395` | Măsurat: `border-radius: 22px`, `padding: 20px`, `background: rgb(18,20,18)` (`--s1`) |
| Titlul panoului: 17 px, extrabold, tracking negativ | `web/src/ui-app.tsx:404` | `text-[17px] font-extrabold tracking-[-0.03em]` |
| Descrierea panoului: 13,5 px, `text-ink2` | `web/src/ui-app.tsx:405` | `mt-1 text-[13.5px] text-ink2` |
| Suprafețele din interiorul panoului (`ListRow`, `StatTile`, `EmptyState`) sunt `rounded-2xl` (16 px) pe `bg-s2` | `web/src/ui-app.tsx:417-425`, `:427-465`, `:488-508` | Razele diferite sunt **intenționate** prin nivel: 22 px = secțiune, 16 px = rând, `rounded-full` = buton/pastilă |
| Rândul de listă: `p-3.5`, titlu 15,5 px extrabold, meta 13 px | `web/src/ui-app.tsx:427-465` | Textul lung este trunchiat, nu împinge pagina |

### 2.3 Butoanele: dimensiuni și ierarhie

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Există **trei** trepte și numai trei: principal, secundar, periculos | `web/src/ui-app.tsx:757`, `:774`, `:791` | `PrimaryButton` = `bg-acc`/`text-on-acc`; `SoftButton` = `bg-s3`/`text-ink`; `DangerButton` = `bg-bad/12`/`text-bad` |
| Toate au **44 px** înălțime, `rounded-full`, `px-5`, 14,5 px, bold | `web/src/ui-app.tsx:765`, `:782`, `:799` | Măsurat pe rutele din zonă: toate butoanele `h: 44`, `font-size: 14.5px` |
| Butonul periculos este pentru **acțiunea distructivă**, nu pentru orice acțiune | `web/src/ui-app.tsx:791-797` vs. `:1024` | Un `DangerButton` pe o acțiune inofensivă înseamnă că roșul nu mai înseamnă „distructiv" (vezi CONS-04) |
| Starea dezactivată e `opacity-50` pe același buton | `web/src/ui-app.tsx:765`, `:782`, `:799` | Nu există o a doua reprezentare a stării dezactivate (vezi CONS-06) |
| Butoanele desenate de mână sunt **copii interzise**: se folosește componenta | `web/src/ui-app.tsx:757-806` | Fiecare copie inline este o divergență în așteptare (vezi CONS-06) |
| Zona de staff are o **densitate documentată** separată: 38 px pe desktop | `web/src/admin/Overview.tsx:78-88` (`denseInput`, `denseButton`…) | Este o excepție conștientă, cu comentariu în cod; nu este o abatere |

### 2.4 Câmpurile de formular și descrierile lor

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Câmpul este `TextInput` / `TextArea` / `Select` | `web/src/ui-app.tsx:696`, `:715`, `:734` | Un `<input>` scris de mână într-o pagină este o abatere (vezi CONS-05) |
| **56 px** înălțime, `rounded-full`, `px-5`, 16 px (15 px de la `lg`) | `web/src/ui-app.tsx:683-685` | Măsurat: `h: 56`, `border-radius: 9999px`, `font-size: 15px` la 1280 px |
| Eticheta: 13,5 px, bold, `text-ink`, `px-1` | `web/src/ui-app.tsx:647-649` | Eticheta este **asociată** controlului (`htmlFor` / `useId`) |
| Ajutorul (`hint`): 12,5 px, `text-ink3`, legat prin `aria-describedby` | `web/src/ui-app.tsx:656-660`, `:631` | Textul de ajutor e sub câmp, în aceeași ordine în toate formularele |
| Eroarea de câmp: 12,5 px, `font-medium`, `text-bad`, `role="alert"` | `web/src/ui-app.tsx:651-655` | Eroarea apare **înaintea** ajutorului, ca în `Field` |
| Inelul de focus e inelul controlului, nu `outline` | `web/src/ui-app.tsx:673-682` | `focus-visible:ring-2 ring-acc`, `outline-none` |
| Casetele de bifare au **24×24 px** (`size-6`) în zona de client | `web/src/app/Settings.tsx:570` | Măsurat: `h: 24` |

### 2.5 Tabelele de date

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Tabelul este `DataTable`: un `<table>` adevărat | `web/src/ui-app.tsx:1036-1093` | Un `<table>` scris de mână într-o pagină este o abatere (vezi CONS-01) |
| Liniile sunt **în fluxul tabelului**: `border-separate` + `borderSpacing: '0 6px'` | `web/src/ui-app.tsx:1056-1061` | Niciun `grid` pe `<tbody>` — altfel antetul iese din aliniament (defectul `UX-01`) |
| Lățimile coloanelor sunt decise **o singură dată**, în `<colgroup>`, și sunt folosite de antet și de celule | `web/src/ui-app.tsx:1065-1069` | Antetul stă pe coloana lui, indiferent cât de lung e valoarea |
| Tabelul lat se **derulează în cutia lui**, nu în pagina | `web/src/ui-app.tsx:1055` | `overflow-x-auto` + `bm-hide-scroll`; pe telefon, aceleași date sunt un `CardList` (`web/src/ui-app.tsx:1096`) |
| Valoarea lungă e trunchiată cu elipsă și păstrată în `title` | `web/src/lib/table.ts:77` (`cellClass`) | Nicio valoare nu iese din cutia tabelului |

### 2.6 Pastilele de stare

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Pastila de stare este `StatusPill` | `web/src/ui-app.tsx:574-589` | O insignă desenată de mână este o abatere (vezi CONS-02) |
| Mărimea: `px-2.5 py-1`, 12 px, bold, `rounded-full` | `web/src/ui-app.tsx:581-585` | Toate insignele au aceleași mărimi |
| Tonul vine din **o singură hartă** (`STATUS_TONE`) | `web/src/ui-app.tsx:544-571` | `online/active/paid` → accent; `pending/provisioning` → avertisment; `failed/error` → roșu; `stopped/cancelled` → neutru |
| Textul lung se rupe în pastilă, nu întinde rândul | `web/src/ui-app.tsx:583`, `:586` | `max-w-full` + `break-words` |

### 2.7 Stările goale

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Starea goală este `EmptyState` | `web/src/ui-app.tsx:488-508` | Rază 16 px, `bg-s2`, centrată, `px-4 py-6` / `sm:px-5 sm:py-8` |
| O linie ce spune ce lipsește, o descriere, o acțiune | `web/src/ui-app.tsx:500-508` | Titlu 16 px extrabold; descriere `max-w-[38ch]`, 14 px |
| Acțiunea ocupă lățimea telefonului | `web/src/ui-app.tsx:507` | `[&>*]:w-full sm:[&>*]:w-auto` |
| Încărcarea este `LoadingBlock` / `Skeleton`, distinctă de starea goală | `web/src/ui-app.tsx:470-486` | Scheletul nu trebuie să arate ca un catalog gol (`UX-07`) |

### 2.8 Spațierea

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Scara Tailwind de 4 px; valorile arbitrare sunt excepții, nu regulă | `audit/06-design-system.md` §2.3 | Spațierea nu se inventează într-o pagină: se moștenește din componenta comună |
| Spațiul de conținut: `px-4 sm:px-6`, `pb-32 pt-2 lg:pb-10` | `web/src/ui-app.tsx:257` | Rezervarea de jos acoperă bara de navigație de pe telefon |
| Spațiul intern al panoului: `p-4 sm:p-5` | `web/src/ui-app.tsx:381` | Rândul: `p-3.5`; grila de rânduri: `gap-2`; lista: `gap-2`/`gap-2.5` |
| Suprafața maximă: 1280 px, `mx-auto` | `web/src/ui.tsx` (`Wrap`) | Conținutul nu se lărgește pe ecrane mari |

### 2.9 Tipografia

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Două familii: sans pentru interfață, mono pentru cifre și cod | `web/src/index.css:59-60` | Cifrele, sumele, cheile și adresele sunt în mono (`tabular-nums`) |
| Greutățile sunt normalizate: medium 400, extrabold/black 700 | `web/src/index.css:61-62` | Niciun „700" real, niciun „800" sintetizat |
| Mărimile sunt din mulțimea fixă: 11, 11,5, 12, 12,5, 13, 13,5, 14, 14,5, 15, 15,5, 16, 17, 18, 19, 22 px | măsurat pe arbore | Un titlu nou nu inventează o mărime nouă |
| Titlurile au tracking negativ; etichetele nu | ex. `web/src/ui-app.tsx:404`, `:651` | `tracking-[-0.03em]` / `tracking-[-0.04em]` numai pe titluri |
| Textul secundar este `ink2`, cel terțiar `ink3` | `web/src/index.css` (`--color-ink2`, `--color-ink3`) | Trei trepte de atenuare, nu patru |

### 2.10 Stările de navigație

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Elementul activ din navigația de desktop: `bg-s2 text-ink`, pictogramă `text-acc`, `aria-current="page"` | `web/src/ui-app.tsx:208-211` | Starea activă este identificată și prin culoare, și prin `aria-current` |
| Elementul inactiv: `text-ink2`, la hover `bg-s2 text-ink` | `web/src/ui-app.tsx:209` | Nicio poziție nu are o culoare proprie |
| Tab-ul de pe telefon: `min-h-[56px]`, `rounded-2xl`, activ = `bg-s2 text-ink` + bară de accent de 3 px | `web/src/ui-app.tsx:278-283` | Bara de accent marchează activul fără să depindă doar de culoare |
| Un selector în două sau mai multe poziții este `Segmented` | `web/src/ui-app.tsx:808-869` | `role="tablist"` sau `role="group"`, `aria-selected`/`aria-pressed`, `aria-label` |
| Segmentul: `h-11`, `px-3.5`, 13,5 px, activ `bg-ink text-bg`, inactiv `bg-s2 text-ink2` | `web/src/ui-app.tsx:842-845` | Banda de filtrare desenată de mână încalcă măsura (vezi CONS-03) |

### 2.11 Notificările și mesajele de validare

| Regula | De unde vine | Cum trebuie să fie |
|---|---|---|
| Notificarea de succes este `useToast` | `web/src/ui-app.tsx:873-906` | `role="status"`, `aria-live="polite"`, dispare în 4,5 s |
| Notificarea de eroare e un bloc `role="alert"` cu `bg-bad/10` | ex. `web/src/app/Settings.tsx:275` | **O singură** nuanță de fundal pentru alertă (`DS-10` — încă necorectat: `bg-bad/12` apare în 9 alte locuri) |
| Mesajul de eroare al câmpului vine din `Field` | `web/src/ui-app.tsx:651-655` | Eroarea de câmp și alerta de pagină sunt două lucruri diferite, cu tipografii diferite |
| Textul butonului în timpul unei acțiuni: „Saving…", „Working…", „Closing…" | ex. `web/src/app/Settings.tsx:438`, `:712` | Butonul nu se schimbă ca mărime în timpul acțiunii |
| Nu există cod inline de culoare în afara token-urilor | `audit/06-design-system.md` §2.1 | Nicio culoare nouă nu se introduce într-o pagină |

---

## Abaterile găsite

### CONS-01 — `/app/domains`: tabelul înregistrărilor DNS era un tabel scris de mână, cu rândurile scoase din tabel

| | |
|---|---|
| **Rută** | `/app/domains` (panelul de domeniu, tabelul „Address record to create") |
| **Componentă** | `web/src/app/Domains.tsx` — tabelul scris de mână, în loc de `DataTable` |
| **Regula încălcată** | **2.5 Tabelele de date** — „liniile sunt în fluxul tabelului: `border-separate` + `borderSpacing: '0 6px'`, lățimile decise o singură dată în `<colgroup>`; niciun `grid` pe `<tbody>`" |
| **Severitate / clasă** | High / `VERIFIED` pe buildul live `3948f7f`; **corectat în arborele de lucru** (20:54 UTC) |

**Dovadă (buildul live).** `web/src/app/Domains.tsx:297` — `<table className="w-full border-collapse text-left">`, cu
`<tbody className="grid gap-1.5">` la `:314` și rânduri cu `rounded-2xl bg-s3` desenate manual. Este **exact
defectul `UX-01`**, care a fost corectat în componenta comună (`web/src/ui-app.tsx:1036-1093`, `border-separate` +
`colgroup`), dar a rămas neatins într-un tabel scris de mână: grila pe `<tbody>` scoate rândurile din fluxul
tabelului, deci antetul se întinde pe toată lățimea, iar rândurile ocupă doar o parte din ea.

**Starea în arborele de lucru.** Corectat: `web/src/app/Domains.tsx:299` — `<table className="w-full
border-separate text-left" style={{ borderSpacing: '0 6px' }}>`, cu un `<colgroup>` de patru coloane (`:300-305`)
și `<tbody>` fără grilă (`:322`). **Nu este însă încă în buildul live**; abaterea rămâne reală pentru
producție până la lansare.

**Corectare recomandată.** Nicio în codul nou: trebuie doar lansat arborele de lucru. Pentru viitor, tabelele
scrise de mână se înlocuiesc cu `DataTable` (`web/src/ui-app.tsx:1036`), iar grila pe `<tbody>` se interzice prin
recenzia de cod.

---

### CONS-02 — `/app/settings` (și zona de ticket): trei insigne desenate de mână, în trei mărimi, niciunul `StatusPill`

| | |
|---|---|
| **Rută** | `/app/settings` (panoul „Profile" și panoul „Sessions"), `/app/tickets/:id`, `/admin/tickets` |
| **Componentă** | `<span>` cu clase scrise de mână, în loc de `StatusPill` (`web/src/ui-app.tsx:574`) |
| **Regula încălcată** | **2.6 Pastilele de stare** — „pastila este `StatusPill`: `px-2.5 py-1`, 12 px, bold; tonul vine din `STATUS_TONE`" |
| **Severitate / clasă** | Medium / `VERIFIED` (măsurat în runtime) + `CODE-INSPECTED` |

**Dovadă.** Pe `/app/settings` (măsurat la 1280 px):

| Insignă | Fișier:linie | `font-size` | fundal | padding |
|---|---|---|---|---|
| „Verified" / „Not verified" | `web/src/app/Settings.tsx:287-289` | **12 px** | `bg-acc-bg` / `bg-s3` | `px-3 py-1` |
| „This device" | `web/src/app/Settings.tsx:488` | **11 px** | `bg-acc-bg` (`rgb(18,41,27)`) | `px-2.5 py-0.5` |
| rolul autorului (ticket) | `web/src/app/TicketDetail.tsx:257`, `web/src/admin/Tickets.tsx:448` | **11,5 px** | `bg-s3` | `px-2.5 py-0.5` |
| *(referință)* `StatusPill` | `web/src/ui-app.tsx:581-585` | 12 px | `bg-acc/12` / `bg-warn/12` / `bg-bad/12` | `px-2.5 py-1` |

Trei mărimi diferite pentru același concept, iar **niciuna nu este cea a componentei comune**. În plus, „Verified"
și „This device" folosesc `bg-acc-bg` (o suprafață plină, `--color-acc-bg`, `web/src/index.css:44`), pe când
`StatusPill` desenează starea pozitivă cu `bg-acc/12` (aceeași culoare, la 12% peste suprafață) — deci aceeași
idee are două tratamente diferite în aceeași pagină.

**Observație de corpus.** `audit/06-design-system.md` §6.1 afirmă „Pastila de stare | **consistent** | `StatusPill`".
**Acea afirmație nu mai este adevărată** în codul curent: există trei insigne desenate de mână, în afara
componentei. Nu este o constatare nouă *ca simptom* (mecanismul „insignă desenată de mână" este vechi), dar
concluzia „consistent" din document trebuie corectată.

**Impact.** Pe pagina de Setări, „Verified" și „This device" arată ca două obiecte de aceeași familie, dar sunt
la 12 px și 11 px; pe telefon, la 11 px, insigna „This device" se pierde lângă numele dispozitivului — exact
insigna care trebuie citită ca să fie recunoscută sesiunea curentă (vezi `20-sessions-and-account-security.md`,
SESS-04).

**Corectare recomandată.** `web/src/app/Settings.tsx:287-291` și `:488` — se folosește `StatusPill` (importat din
`web/src/ui-app.tsx`), cu `status="verified"` / `status="current"` și eticheta `label="This device"`; cele două
intrări noi se adaugă în `STATUS_TONE` (`web/src/ui-app.tsx:544-571`). `web/src/app/TicketDetail.tsx:257` și
`web/src/admin/Tickets.tsx:448` — la fel, `StatusPill`.

---

### CONS-03 — `/app/instances`, `/apps`, `/app/deploy`: banda de filtrare este desenată de mână în loc de `Segmented`

| | |
|---|---|
| **Rută** | `/app/instances` (două benzi: tip și stare), `/apps` (catalogul public), `/app/deploy` (catalogul de lansare) |
| **Componentă** | butoane cu `aria-pressed`, desenate de mână, în loc de `Segmented` (`web/src/ui-app.tsx:808`) |
| **Regula încălcată** | **2.3 Butoanele** (dimensiuni și ierarhie) și **2.10 Stările de navigație** („un selector în două sau mai multe poziții este `Segmented`: `h-11`, `px-3.5`, 13,5 px, activ `bg-ink text-bg`, inactiv `bg-s2`") |
| **Severitate / clasă** | Medium / `VERIFIED` (măsurat) + `CODE-INSPECTED` |

**Dovadă.**

| Locație | Fișier:linie | `padding` / `font-size` | inactiv | activ |
|---|---|---|---|---|
| Lista de instanțe (tip) | `web/src/app/Instances.tsx:178` | `px-5` / 14,5 px | `bg-s1` | `bg-ink text-bg` |
| Lista de instanțe (stare) | `web/src/app/Instances.tsx:190` | `px-5` / 14,5 px | `bg-s1` | `bg-ink text-bg` |
| Catalogul public | `web/src/home/Catalog.tsx:144` | `px-5` / 14,5 px | `bg-s1` | `bg-ink text-bg` |
| Catalogul de lansare | `web/src/app/DeployCatalog.tsx:220` | `px-5` / 14,5 px | `bg-s1` | `bg-ink text-bg` |
| *(referință)* `Segmented` | `web/src/ui-app.tsx:842-845` | `px-3.5` / 13,5 px | `bg-s2` | `bg-ink text-bg` |

**Măsurătoare (runtime, 1280 px):** pe `/app/instances`, butonul „All" are `h: 44`, `font-size: 14.5px`; pe
`/apps`, segmentele „All", „Web & CMS", „Developer Tools" … au tot `h: 44`, `font-size: 14.5px`. Același control,
în două dimensiuni diferite în același produs: **cea mai mare diferență e 4 px pe orizontală și 1 px pe text**
(`px-5`/14,5 px față de `px-3.5`/13,5 px). Suprafața inactivă diferă și ea: `bg-s1` (`--s1`, `rgb(18,20,18)`)
în benzile desenate de mână, `bg-s2` (`--s2`, `rgb(26,29,26)`) în `Segmented` — deci pe `bg-s1` (suprafața
panoului) banda desenată de mână are un segment inactiv **invizibil** (fundal identic cu panoul), pe când în
`Segmented` segmentul inactiv se vede.

**Impact.** Benzile desenate de mână stau pe `bg-s1` (suprafața panoului) sau în afara lui; segmentul inactiv
poate dispărea în fundal. În plus, lipsesc `role="group"`/`aria-label` pe grup, deci un cititor de ecran nu
află ce filtrează banda (componenta comună le are: `web/src/ui-app.tsx:832`, `:838-840`).

**Corectare recomandată.** Cele patru locuri (`web/src/app/Instances.tsx:178,190`, `web/src/home/Catalog.tsx:144`,
`web/src/app/DeployCatalog.tsx:220`) se înlocuiesc cu `Segmented`, cu `role="group"` și un `ariaLabel` care spune
ce filtrează banda („Filter instances by type", „Filter the catalog by category"). `ScrollRow` din jur
(`web/src/ui-app.tsx:40`) poate rămâne pentru derularea pe telefon, dar banda în sine vine din componentă.

---

### CONS-04 — `/app/settings`: butonul periculos este folosit pentru o acțiune inofensivă

| | |
|---|---|
| **Rută** | `/app/settings` (panoul „Account") |
| **Componentă** | `DangerButton` pentru „Sign out", lângă `DangerButton` pentru „Ask for the account to be closed" |
| **Regula încălcată** | **2.3 Butoanele: ierarhia** — „butonul periculos este pentru **acțiunea distructivă**; `bg-bad/12`/`text-bad` este rezervat acțiunii care închide sau șterge ceva" |
| **Severitate / clasă** | Medium / `VERIFIED` (măsurat) + `CODE-INSPECTED` |

**Dovadă.** `web/src/app/Settings.tsx:658-665`: un `DangerButton` cu eticheta „Sign out" (deconectare — o
acțiune **inofensivă**, aceeași ca „Sign out" din panoul de sesiuni, care este un `SoftButton`), plasat lângă
`SoftButton` „Take the request back" (`:657`). În același panou, `:711-713`: `DangerButton` „Ask for the account
to be closed" — acțiunea cu adevărat distructivă. **Două butoane roșii, una inofensivă și una distructivă, în
același panou.**

Măsurătorile confirmă că ambele sunt `DangerButton`: fundal `oklab(0.7116 0.1670 0.0704 / 0.12)` =
`bg-bad/12`, `h: 44`, `font-size: 14.5px` — deci diferența nu e de culoare, ci de **semnificație**: roșul nu mai
spune „distructiv".

**Impact.** Ieșirea din cont e o acțiune pe care clientul o face de mai multe ori pe zi și pe care o vede pictată
ca un pericol; invers, cererea de închidere a contului — care cere o parolă și o confirmare scrisă — primește
același semn ca o deconectare. Iar în panoul de sesiuni, „Sign out" e un `SoftButton` (`web/src/app/Settings.tsx:500`):
**același cuvânt, două culori diferite, în aceeași pagină**.

**Corectare recomandată.** `web/src/app/Settings.tsx:658-665` — „Sign out" devine `SoftButton` (ca în panoul de
sesiuni); `DangerButton` rămâne rezervat cererii de închidere a contului (`:711`).

---

### CONS-05 — `/app/instances/:id` (tabul „Startup"): câmpurile de mediu sunt desenate de mână, la 48 px și 14 px

| | |
|---|---|
| **Rută** | `/app/instances/:id` → secțiunea „Startup" (variabilele de mediu) |
| **Componentă** | două `<input>` scrise de mână, în loc de `TextInput` |
| **Regula încălcată** | **2.4 Câmpurile de formular** — „câmpul este `TextInput`: **56 px**, `rounded-full`, `px-5`, **16 px** (15 px de la `lg`); eticheta și ajutorul vin din `Field`" |
| **Severitate / clasă** | Medium / `CODE-INSPECTED` |

**Dovadă.** `web/src/app/instance/StartupTab.tsx:120` și `:131`: `className="h-12 min-w-0 rounded-full bg-s2
px-4 font-mono text-[14px] …"`. Adică **48 px** în loc de 56 px, **14 px** în loc de 16 px, `px-4` în loc de
`px-5`, iar fără etichetă vizibilă (doar `aria-label`, `web/src/app/instance/StartupTab.tsx:119` și `:130`) și
fără ajutor — deci cele două câmpuri „nume" și „valoare" nu au niciun text care să le distingă vizual.

**Impact.** În aceeași pagină, câmpul de comandă de pornire este desenat la 56 px (componenta comună), iar
perechea de variabile de mediu la 48 px; pe telefon, 48 px e sub ținta de 44 px doar cu 4 px margine și sub
ținta de 56 px a restului formularului. Textul de 14 px e mai mic decât restul formularului, iar perechea de
câmpuri e singura din pagină fără etichetă vizibilă.

**Corectare recomandată.** `web/src/app/instance/StartupTab.tsx:111-138` — se folosește `TextInput` cu `label`
„Name" / „Value" și `hint` care explică perechea; dacă aspectul mono trebuie păstrat, se păstrează doar clasa
`font-mono` pe control, nu mărimea și înălțimea. Butonul „Remove" din aceeași grilă (`:135-140`) este un
`SoftButton` cu `className="h-12"` — se revine la 44 px, ca restul paginii.

---

### CONS-06 — Butonul secundar este desenat de mână în 8 locuri, în trei mărimi, cu o stare dezactivată diferită

| | |
|---|---|
| **Rută** | `/app`, `/app/instances`, `/app/billing`, `/app/tickets`, `/app/domains`, `/app/instances/:id`, `/app/deploy` |
| **Componentă** | butoane `<button>`/`<a>` cu clasele treptului secundar, scrise de mână, în loc de `SoftButton` (`web/src/ui-app.tsx:774`) |
| **Regula încălcată** | **2.3 Butoanele: dimensiuni și ierarhie** — „există trei trepte și numai trei; toate au 44 px, `rounded-full`, `px-5`, 14,5 px, bold; starea dezactivată e `opacity-50` pe același buton; butoanele desenate de mână sunt copii interzise" |
| **Severitate / clasă** | Low / `CODE-INSPECTED` |

**Dovadă — inventarul copiilor din arbore (20:54 UTC).**

| Treaptă | Dimensiune | Locații |
|---|---|---|
| principal | `px-5` / 14,5 px (identic cu `PrimaryButton`) | `app/Overview.tsx:61`, `app/Instances.tsx:18`, `app/Billing.tsx:61`, `app/Deploy.tsx:121`, `app/Domains.tsx:40`, `app/InstanceDetail.tsx:379`, `app/InstanceDetail.tsx:416`, `app/DeployCatalog.tsx:45`, `admin/Overview.tsx:193` |
| secundar | `px-5` / 14,5 px (identic cu `SoftButton`) | `app/Overview.tsx:63`, `app/Instances.tsx:217`, `app/DeployCatalog.tsx:252` |
| secundar | **`px-4` / 13,5 px** | `app/Billing.tsx:398`, `app/Billing.tsx:407`, `app/InstanceDetail.tsx:674`, `app/instance/OverviewTab.tsx:162` |
| secundar | **`px-3.5` / 13 px** (butoanele „Copy") | `app/Domains.tsx:255`, `app/Domains.tsx:279`, `app/Domains.tsx:346` |
| secundar **dezactivat** | `px-5` / 14,5 px, **`text-ink3` la opacitate plină** | `app/DeployCatalog.tsx:49` (`idleLink`) |

**Abaterile reale, nu doar repetările.**
1. **Trei mărimi pentru același trept secundar** (`px-5`/14,5 px, `px-4`/13,5 px, `px-3.5`/13 px): pe pagina de
   domenii, butonul „Copy" este mai mic și mai strâns decât butonul secundar din restul zonei de client.
2. **Starea dezactivată e desenată altfel**: `app/DeployCatalog.tsx:49` folosește `text-ink3` la opacitate
   plină, pe când `SoftButton` desenează starea dezactivată ca `text-ink` la `opacity-50`
   (`web/src/ui-app.tsx:781`). Două butoane dezactivate identice ca rol arată diferit în catalogul de lansare și
   în restul aplicației.
3. **Butonul „Remove" din grila de variabile** (`app/instance/StartupTab.tsx:135-140`) e un `SoftButton` cu
   `className="h-12"` — 48 px, într-o pagină în care tot restul e la 44 px.

**Impact.** Sunt 8 copii ale butonului principal care trebuie urmărite la fiecare schimbare a componentei, și
patru copii ale celui secundar cu mărimi diferite; divergențele de mai sus apar în pagini diferite, pentru
același rol.

**Corectare recomandată.** `app/Overview.tsx:61-63`, `app/Instances.tsx:18,217`, `app/Billing.tsx:61,398,407`,
`app/Deploy.tsx:121`, `app/Domains.tsx:40,255,279,346`, `app/InstanceDetail.tsx:379,416,674`,
`app/instance/OverviewTab.tsx:162`, `app/DeployCatalog.tsx:45`, `:49`, `:252`, `admin/Overview.tsx:193` — se folosesc
`PrimaryButton` / `SoftButton` / `DangerButton` din `web/src/ui-app.tsx`. Pentru „Copy" se alege explicit fie
`SoftButton` (44 px, `px-5`), fie o componentă nouă `IconButton` cu ținta de 44 px, dacă textul „Copy" trebuie
păstrat. Pentru starea dezactivată din `app/DeployCatalog.tsx:49` se folosește `SoftButton` cu `disabled`.

---

## Ce a fost măsurat și nu s-a găsit ca abatere

Raportat pentru echitate, ca să fie limpede că nu s-a căutat doar probleme:

- **Antetul paginii e uniform** pe toate rutele măsurate: un singur `<h1>`, 22 px la 1280 px, din coaja
  aplicației (`web/src/ui-app.tsx:246`). Măsurat pe `/app`, `/app/instances`, `/app/domains`, `/app/billing`,
  `/app/tickets`, `/app/settings`.
- **Panourile sunt uniforme**: rază 22 px, `padding: 20px`, `background: rgb(18,20,18)` — măsurat pe aceleași
  șase rute.
- **Butoanele din zona de client au toate 44 px și 14,5 px** — măsurat pe `/app/billing`, `/app/tickets`,
  `/app/settings` (butoanele măsurate: „Save the name", „Change the email address", „Change the password",
  „Sign out", „Save the preferences", „Ask for the account to be closed", „New ticket", „Create a ticket",
  „Manage payment method").
- **Câmpurile de formular din zona de client sunt la 56 px, `rounded-full`, 15 px la 1280 px, cu etichetă
  asociată** — măsurat pe `/app/settings` (11 câmpuri, inclusiv cele 5 casete de notificare, la 24×24 px).
- **Stările goale folosesc `EmptyState`** în listele din zonă (`web/src/ui-app.tsx:488`).

## Ce nu a putut fi măsurat

- **Tabelul din CONS-01 nu a putut fi randat în runtime**: contul de test nu are domeniu cu înregistrări DNS, deci
  abaterea e dovedită prin cod (buildul live) și prin comparație cu defectul `UX-01` deja măsurat; corecția din
  arborele de lucru nu a fost randată în browser.
- **Zona de staff (`/admin/*`) nu a fost măsurată în browser**: contul de staff nu era disponibil în stiva
  izolată. Inventarul de copii de buton din `admin/Overview.tsx:193` e din cod. Familia „dense"
  (`admin/Overview.tsx:78-88`, 38 px pe desktop) e o **a doua scară documentată**, nu o abatere — dar n-a fost
  măsurată pe ecran.
- **Pagina de produs (`/apps/:slug`), pagina de documentație (`/docs`) și pagina de stare (`/status`)** au fost
  deschise și măsurate, dar **nu au fost verificate rând cu rând** pe elementele contractului: sunt pagini
  publice, cu identitate proprie (titlu mare, `Headline`, `Eyebrow`, butoane `size="lg"` la 56 px), iar
  contractul de mai sus descrie **coaja aplicației**. Diferențele dintre cele două lume (public / aplicație) sunt
  în themselves o decizie de identitate, nu o abatere; pentru ele n-a fost făcută o trecere completă.
- **Contrastul nu a fost remăsurat**: se referă la `DS-01`/`DS-02`/`DS-03`/`UX-09`/`UX-10`, deja măsurate; aici s-a
  verificat doar că stările de alertă folosesc în continuare două nuanțe (`DS-10`).
- **Mișcarea (`prefers-reduced-motion`) nu a fost remăsurată**: se referă la `DS-08`/`UX-19`.
- **Nu a fost măsurată lățimea pe telefon** pentru noile abateri: măsurătorile sunt la 1280 px, cu excepția
  zonelor unde e relevantă ținta de 44 px (butoanele) — măsurate tot la 1280 px, unde înălțimea nu depinde de
  lățime. Nu s-a făcut un sweep pe 6 lățimi, cum s-a făcut pentru `UX-16`/`UX-17`.
