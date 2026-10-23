# 06 — Design system: cum este, cum ar trebui să fie

**Data:** 2026-10-23 · **Baza codului:** `7df3973` · **Metodă:** citirea sursei + măsurare în browser pe `https://blipmade.com` (Chromium 139, `xvfb-run` pe VM 103).

Clasele de verificare folosite mai jos: `VERIFIED` (măsurat pe sistemul care rulează), `CODE-INSPECTED` (citit în sursă, neexecutat), `INFERRED` (dedus din altă dovadă, raționamentul este dat).

---

## 1. Unde stă design system-ul

Nu există un pachet, un `tokens.json` sau un folder `design-system/`. Design system-ul este **în cod**, răspândit în patru locuri:

| Fișier | Ce conține | Volum |
|---|---|---|
| `web/src/index.css` | token-urile `@theme`, fonturile, indicatorul de focus, barele de scroll, animațiile, `prefers-reduced-motion` | 187 linii |
| `web/src/ui-app.tsx` | componentele de aplicație (25 exporturi) | 1092 linii |
| `web/src/ui.tsx` | componentele publice (9 exporturi) | 91 linii |
| `web/src/icons.tsx` | setul de pictograme, 24 trasee SVG desenate manual | 31 linii |

A mai există `web/src/pages/auth-field.tsx` (câmpul unic al celor cinci ecrane de autentificare) și `web/src/app/instance/common.tsx` (contractul dintre paginile de instanță).

`CODE-INSPECTED` — tot ce urmează despre structura codului.

**Verdictul pe scurt:** sistemul este **real, coerent și folosit consecvent**. Nu este o colecție de stiluri întâmplătoare. Dar are **trei găuri concrete** care se văd la fiecare client: un token de culoare care nu trece contrastul AC pe trei suprafețe, un buton roșu cu text alb la 2.78:1, și o lipsă de componente de bază pe care le presupun cele mai multe ecrane.

---

## 2. Token-urile

### 2.1 Culoarea — `web/src/index.css:38-54`

```css
@theme {
  --color-bg:     #090a09;   /* fundalul paginii */
  --color-s1:     #121412;   /* suprafața 1, cardurile mici */
  --color-s2:     #1a1d1a;   /* suprafața 2, rândurile, câmpurile */
  --color-s3:     #232823;   /* suprafața 3, butoanele soft, hover */
  --color-line:   #303630;   /* liniile de contur */
  --color-acc-bg: #12291b;   /* fundalul stării de accent */
  --color-con:    #050705;   /* fundalul consolei */
  --color-con-ink:#c9d2c9;   /* textul consolei */
  --color-ink:    #f3f6f2;   /* text principal */
  --color-ink2:   #a0a7a0;   /* text secundar */
  --color-ink3:   #7b827b;   /* text terțiar, muț */
  --color-acc:    #6be598;   /* verde, singurul accent */
  --color-acc-h:  #85edab;   /* verde la hover */
  --color-on-acc: #06130b;   /* textul pe verde */
  --color-bad:    #ff6b6b;   /* roșu, stări de eroare */
  --color-warn:   #f0b232;   /* galben, avertismente */
}
```

Este o paletă corectă: un singur accent, o scară de suprafețe de aproape-negru cu pași mici, trei trepte de „atenuare" a textului. Nu există culori care nu apar în token-uri (am căutat în tot `web/src`).

### 2.2 Tipografia — `web/src/index.css:59-70`

```css
--font-sans: "Proxima Nova", "proxima-nova", "Geist Variable", "Inter", system-ui, sans-serif;
--font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;
--font-weight-normal: 400;   --font-weight-medium: 400;
--font-weight-semibold: 600; --font-weight-bold: 700;
--font-weight-extrabold: 700; --font-weight-black: 700;
```

Normalizarea greutăților (medium→400, extrabold/black→700) este **bine făcută**: browserul nu sintetizează greutăți inexistente. `CODE-INSPECTED`

**Problema cunoscută, confirmată încă o dată.** `web/src/index.css:15-35` declară trei `@font-face` pentru *Proxima Nova*, cu `src: url("/fonts/proxima-nova-{400,600,700}.woff2")`. Fișierele nu există:

```console
$ curl -s https://blipmade.com/healthz
{"status":"ok","fonts":{"family":"Proxima Nova","installed":false,
 "missing":["/fonts/proxima-nova-400.woff2","/fonts/proxima-nova-600.woff2","/fonts/proxima-nova-700.woff2"],
 "fallback":"Geist Variable"}}
```
`VERIFIED`

Consecința reală, nu teoretică: **fiecare descărcare a paginii cere trei fișiere care răspund 404.** Le-am numărat în browser — nu e o problemă de latență, e trafic inutil la fiecare vizitare, plus un `console` plin de erori de rețea pe care nimeni nu le citește. `font-display: swap` face ca textul să apară imediat cu Geist, deci **nu există niciun flash vizibil** — interfața arată identic cu cea intenționată. `VERIFIED`

Ce trebuie spus corect într-un raport: **Proxima Nova nu este "instalată"; Geist Variable este cea care se folosește efectiv.** Nu este o regresie — este o raționalizare a designului care nu a fost dusă până la capăt. Fixul este o linie: fie se pun fișierele, fie se scoate blocul `@font-face` și rămâne doar fallback-ul. Recomandarea: **se scoate blocul `@font-face`** (nu se publică niciodată fișierele desktop-ului, iar `healthz` raportează deja `installed:false`), până când există o decizie de licență.

### 2.3 Spațierea, razele, mișcarea

| Dimensiune | Valoare | Observație |
|---|---|---|
| Spațiere | escala Tailwind (4 px) + `gap-[14px]`, `gap-[13px]`, `gap-[11px]`, `p-[14px]` etc. | `VERIFIED` prin histogramă: `grep -rho "\[[0-9]+px\]" web/src \| sort \| uniq -c` |
| Raze | `rounded-2xl` (173×), `rounded-full` (163×), `rounded-xl` (12×), `rounded-lg` (12×), `rounded-[22px]`, `rounded-[24px]`, `rounded-[28px]`, `rounded-[32px]`, `rounded-[28%]` | `VERIFIED` — `rounded-2xl` = 16 px, `rounded-full` = 9999 px |
| Tranziții | `duration-[180ms]` (106×), `duration-[220ms]` (15×), `duration-[320ms]` (4×), `duration-200` (1×) | `VERIFIED` |
| Easing | `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)` | `index.css:72` |

Observație: **nu există un token de spațiere sau de rază**. Sunt 44 de valori `rounded-[Npx]` arbitrare, distribuite în trei familii (22/24/26/28/32 px) care nu urmează o scară. Cele trei familii de rază sunt vizibil diferite pe ecran și nu sunt legate de niciun token. `CODE-INSPECTED`

### 2.4 Mișcarea — `web/src/index.css:166-187`

```css
.rv     { opacity:0; transform:translate3d(0,12px,0); transition:opacity 220ms var(--ease-out), transform 220ms var(--ease-out); }
.rv[data-in] { opacity:1; transform:none; }
.ln > span { transform:translateY(105%); transition:transform 320ms var(--ease-out); }
.bm-pop   { animation: bm-pop 220ms var(--ease-out) both; }
.bm-float { animation: bm-float 6s ease-in-out infinite; }
.bm-ping::after { animation: bm-ping 2s var(--ease-out) infinite; }
.bm-caret { animation: bm-blink 1s steps(1) infinite; }
.bm-in    { animation: bm-in 200ms var(--ease-out) both; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .rv, .ln > span { transition: none; opacity: 1; transform: none; }
  .bm-pop, .bm-float, .bm-ping::after, .bm-caret, .bm-in { animation: none; }
}
```

**Măsură `prefers-reduced-motion`** (Chromium cu `reducedMotion: 'reduce'`):

| | fără reducere | cu reducere |
|---|---|---|
| `matchMedia('(prefers-reduced-motion: reduce)').matches` | `false` | `true` |
| `scroll-behavior` pe `<html>` | `smooth` | `auto` |
| `.rv` | `transition 220ms`, `opacity 0` | `transition 0s`, `opacity 1`, `transform none` |
| `.bm-float` | `animation bm-float 6s infinite` | `animation none` |
| **elemente care încă animează** | **213** | **166** |

`VERIFIED`

**Găura:** blocul `prefers-reduced-motion` acoperă **doar** clasele proprii. Cele **166** de elemente care rămân animate sunt cele cu utilitarele Tailwind (`duration-[180ms]`, `duration-[220ms]`), inclusiv `transition-transform` pe indicatorul galben al navigației (`home/Nav.tsx`, `transitionProperty: "transform, translate, scale, rotate"`) și `active:scale-[0.97]` pe butoanile principale (`ui-app.tsx:764`). `CODE-INSPECTED` + `VERIFIED` (numărul 166 măsurat).

Severitate: **mică**. Mișcarea rămasă e o tranziție de culoare de 180 ms (nu deranjează) și o mică scală la apăsare. Dar WCAG 2.3.3 *Animation from Interactions* (AAA) cere ca mișcarea de interacțiune să poată fi oprită; pentru AA, 2.2.2 *Pause, Stop, Hide* se aplică doar mișcării automate de peste 5 s, iar `bm-float` (6 s) **este** oprită corect. Deci: **nu este o încălcare AA**, ci o neconcordanță între promisiunea codului („reduced motion") și efectul ei.

---

## 3. Componentele

### 3.1 Ce există — `web/src/ui-app.tsx`

| Componentă | Linie | Rol |
|---|---|---|
| `AppShell` | 120 | coaja aplicației: navigația de desktop, bara de jos a telefonului, antetul, acțiunile |
| `ScrollRow` | 39 | bandă de derulare orizontală cu margine estompată |
| `Panel` | 372 | containerul de secțiune |
| `StatTile` | 416 | dală de statistică |
| `ListRow` | 426 | rând de listă |
| `Skeleton` | 469 | schelet de încărcare |
| `LoadingBlock` | 473 | bloc de încărcare cu etichetă |
| `EmptyState` | 487 | stare goală |
| `ErrorState` | 509 | stare de eroare cu buton de reluare |
| `StatusPill` | 573 | pastilă de stare |
| `Money` | 591 | sumă cu monedă și perioadă |
| `Field` / `TextInput` / `TextArea` / `Select` | 612 / 695 / 714 / 733 | câmpurile formularului |
| `PrimaryButton` / `SoftButton` / `DangerButton` | 756 / 773 / 790 | cele trei trepte de buton |
| `Segmented` | 807 | selector în două sau mai multe poziții |
| `ToastProvider` | 872 | notificări |
| `ConfirmDialog` | 907 | dialog de confirmare |
| `DataTable` / `CardList` | 1035 / 1079 | două forme de a afișa o listă |

`web/src/ui.tsx`: `Wrap`, `Reveal`, `Headline`, `Eyebrow`, `Button`, `Logo`, `StatusDot`, `AppMark`.
`web/src/pages/auth-field.tsx`: `FieldShell`, `FieldInput`, `FieldReveal`, `AuthField`.

### 3.2 Ce nu există

Verificat prin căutare pe tot arborele `web/src` (`grep -rlE "(function|const) <N>\b|export .*\b<N>\b"`), rezultat **gol** pentru toate:

`Modal`, `Dialog` (există doar `ConfirmDialog`, fără o bază reutilizabilă), `Tooltip`, `Accordion`/`Disclosure`, `Tabs`/`TabList`/`TabPanel`, `Alert`/`Banner`, `Progress`, `Pagination`, `Breadcrumb`, `Spinner`, `Card`, `Checkbox`, `Switch`, `Radio`, `Toggle`, `Copy`, `Clipboard`, `DateFormat`, `FormSkeleton`.

`CODE-INSPECTED`

Cele care lipsesc și se văd în produs:

1. **`Alert` / `Banner`.** Nu există un component pentru un mesaj persistent în pagină. Consecința: starea „adresa ta nu e verificată" **nu există deloc** (vezi `06-customer-journeys.md`, J1.6). Fiecare pagină își scrie propriul `<p role="alert" className="rounded-2xl bg-bad/10 ...">` — **29 de copii ale aceluiași bloc**, cu `bg-bad/10` în 20 de locuri și `bg-bad/12` în 9. `grep -c "bg-bad/1" web/src/**/*.tsx` — două nuanțe diferite ale aceluiași roșu, pentru același lucru. `CODE-INSPECTED`
2. **`Tabs`.** Pagina instanței are taburi (`app/instance/common.tsx:23` definește `TABS`), dar fiecare pagină își scrie propriile butoane `role="tab"` cu propriile clase. Fără un component `Tabs`, comportamentul de tastatură (săgeți stânga/dreapta, `aria-selected`, `tabpanel`) trebuie repetat în fiecare implementare.
3. **`DateFormat`.** Datele sunt formatate manual, cu `toLocaleString` sau `Intl`, în fiecare pagină. Rezultatul: „23 Oct 2026, 04:15" pe pagina instanței, „23 Oct 2026" pe liste, „23 Oct 2026, 07:20" pe ticket — trei formate pentru același lucru.
4. **`Card`.** `Panel` acoperă nevoie similară, dar `rounded-[22px]` / `rounded-[24px]` / `rounded-[28px]` / `rounded-[32px]` apar ca valori scrise manual în 44 de locuri, fără un token. `CODE-INSPECTED`
5. **`Breadcrumb`.** Pagina instanței are un link de înapoi (`InstanceDetail.tsx:640`), nu o firă de pâine.
6. **`Progress` / `Spinner`.** Provisionarea este reprezentată doar prin text. Nu există o componentă de progres, iar clientul nu are un indicator de proces.
7. **`Checkbox` / `Switch`.** Casetele de permisiuni din `admin/Staff.tsx` sunt `input[type=checkbox]` cu `size-4` (16×16 px) — vezi §5.3.

---

## 4. Setul de pictograme

`web/src/icons.tsx:1-26` conține **24** de trasee SVG, desenate manual, toate cu `viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth="1.6"`, `aria-hidden="true"`:

`arrow, arrowUR, check, search, menu, close, eye, eyeOff, globe, db, folder, term, chart, card, rocket, shield, restart, box, bolt, bot, mon, flow, code, doc`

`CODE-INSPECTED`

**Merite:** fără bibliotecă externă, fără icon-font, `currentColor` (deci culoarea vine din token-uri), `aria-hidden` (deci nu poluează cititorul de ecran — textul e mereu lângă ele).

**Lipse:** nu există pictogramă de **copiere**, **descărcare**, **încărcare (upload)**, **fileră**, **săgeată sus/jos**, **exterior (external link)**, **ajutor (?)**. Lipsa pictogramei de „încărcare" și de „copiere" se vede în interfața de fișiere a instanței (`app/instance/FilesTab.tsx`), unde acțiunile sunt doar text.

---

## 5. Evaluarea de accesibilitate (WCAG 2.2 AA)

Toate măsurătorile sunt făcute în browser pe site-ul care rulează. Scriptul de măsură este `audit/_tools/a11y-measure.mjs`; raportul brut este `audit/_tools/a11y-report.json`.

### 5.1 Contrastul textului — **o singură cauză, totul**

Raportul perete înapoi cu culoarea textului, **compusând alpha-ul suprafeței peste părintele ei**, ca în browser.

| text | pe `--bg` `#090a09` | pe `--s1` `#121412` | pe `--s2` `#1a1d1a` | pe `--s3` `#232823` | pe `--acc-bg` `#12291b` |
|---|---|---|---|---|---|
| `--ink` `#f3f6f2` | 18.20 | 16.99 | 15.61 | 13.78 | 14.19 |
| `--ink2` `#a0a7a0` | 8.05 | 7.52 | 6.91 | 6.10 | 6.28 |
| **`--ink3` `#7b827b`** | 5.02 | 4.69 | **4.31** | **3.80** | **3.92** |
| `--acc` `#6be598` | 12.55 | 11.71 | 10.76 | 9.50 | 9.78 |
| `--acc-h` `#85edab` | 13.88 | 12.96 | 11.91 | 10.50 | 10.82 |
| `--bad` `#ff6b6b` | 7.15 | 6.67 | 6.13 | 5.41 | 5.57 |
| `--warn` `#f0b232` | 10.50 | 9.80 | 9.01 | 7.95 | 8.18 |

`VERIFIED` — raportul relativ de luminanță WCAG, calculat din valorile `getComputedStyle` ale fiecărui element de text.

**`--ink-3` este singurul token care eșuează — și singurul.** Din **63 de elemente de text** aflați sub prag pe 31 de pagini măsurate, **toate cele 63** au culoarea `#7b827b`. Nu există nicio altă pereche de culori care să eșueze. Distribuția:

| pereche | raport | prag | elemente | pagini |
|---|---|---|---|---|
| `#7b827b` pe `#1a1d1a` (`--s2`) | 4.31 | 4.5 | **56** | 20 |
| `#7b827b` pe `#232823` (`--s3`) | 3.80 | 4.5 | **4** | 4 |
| `#7b827b` pe `#12291b` (`--acc-bg`) | 3.92 | 4.5 | **3** | 3 |
| orice altă pereche | — | — | **0** | 0 |

`VERIFIED` — `audit/_tools/a11y-report.json`, grupat pe perechea (foreground, background).

Cazuri concrete, cu selectorul, măsurătoarea și fixul:

| # | Selector | Text | fg / bg | Raport | Prag | Criteriu | Fix |
|---|---|---|---|---|---|---|---|
| A-1 | `.text-ink3` pe `--s2` | „Services", „one app or database", „/ month", „Discord Bot", „No public URL yet", „provisioned: Instance is online.", „23 Oct 2026" (peste tot în `/app`) | `#7b827b` / `#1a1d1a` | **4.31** | 4.5 | 1.4.3 *Contrast (Minimum)* | `--color-ink3: #8a9090` → 5.24 pe `s2` |
| A-2 | `.text-ink3` pe `--s3` | „3 KB" (pagina de start), „Coming soon" (`/app/deploy`), „Preview · minimum configuration", „/ month" (`/admin/pricing`) | `#7b827b` / `#232823` | **3.80** | 4.5 | 1.4.3 | `--color-ink3: #8a9090` → 4.63 pe `s3` |
| A-3 | `.text-ink3` pe `--acc-bg` | „sample", „Deploy" (`/`), „23 Oct 2026, 07:20" (`/app/tickets/:id`) | `#7b827b` / `#12291b` | **3.92** | 4.5 | 1.4.3 | `--color-ink3: #8a9090` → 4.76 pe `acc-bg` |

**Un singur rând de CSS repară toate cele 63 de elemente, din 20 de pagini.** Valoarea propusă `#8a9090` păstrează aceeași nuanță (decalarea +6/+6 pe canalele roșu și verde a lui `#7b827b`) și trece pragul pe toate cele trei suprafețe: `s2` 5.24, `s3` 4.63, `acc-bg` 4.76, `bg` 6.11. `VERIFIED` (rapoartele calculate).

**Un buton cu text alb pe roșu — 2.78:1.** Măsurat în browser, pe pagina reală a instanței, cu dialogul de confirmare deschis (`audit/screenshots/a11y-confirm-dialog.png`):

```
selector : [role="dialog"] button  ("Cancel instance")
classe   : inline-flex h-11 … bg-bad … text-white … font-bold
foreground: #ffffff
background: #ff6b6b
ratio    : 2.78      necesar: 4.5     criteriu: 1.4.3
```

| # | Selector | fg / bg | Raport | Prag | Criteriu | Fix |
|---|---|---|---|---|---|---|
| A-4 | `ui-app.tsx:1023` (butonul de confirmare al dialogului) și `ui-app.tsx:894` (toastul de eroare) | `#ffffff` / `#ff6b6b` | **2.78** | 4.5 | 1.4.3 | `--color-on-bad: #2b0606` (raport 7.34) sau `text-on-acc`-style: **alb pe `#ff6b6b` trebuie înlocuit cu `text-[#3a0808]`** |
| A-5 | `admin/Overview.tsx:192` (butonul periculos al panoului de staff) | `#f3f6f2` / `#ff6b6b` | **2.55** | 4.5 | 1.4.3 | același `--color-on-bad` |

`VERIFIED` — măsurat live pe pagina instanței cu dialogul deschis; `CODE-INSPECTED` pentru celelalte două apariții (nu sunt pe nicio pagină la momentul măsurătorii).

**Perechile care trec.** `--on-acc` `#06130b` pe `--acc` `#6be598` = **12.02** (butonul principal). `--bad` pe `bg-bad/12` peste `s2` = **5.18**. `--acc` pe `bg-acc/12` peste `s2` = **8.22**. `--warn` pe `bg-warn/12` peste `s2` = **7.10**. Toate trec. `VERIFIED`

### 5.2 Vizibilitatea indicatorului de focus — **bine făcut**

Sistemul are **două** straturi, în `web/src/index.css:78-85`:

```css
@layer base {
  :focus-visible { outline: 2px solid var(--color-acc); outline-offset: 3px; border-radius: 8px; }
}
```

comentariul din cod explică intenția: stratul de bază poate fi oprit de un control care își are propriul inel, cu `focus-visible:outline-none`. Pătratul e același peste tot: ** inel de 2 px în `--acc`, cu `outline-offset` de 3 px**.

Am parcurs **202 de controale** cu tasta Tab, pe 11 pagini, și am cit `box-shadow`-ul fiecăruia. Prima măsurătoare a raportat 170 de controale fără indicator — **măsurătoarea era greșită**: regex-ul citea *blur* în loc de *spread*. După corectare:

| | număr |
|---|---|
| controale examinate | 202 |
| **fără indicator de focus** | **5** |
| dintre care indicatorul e mutat pe un strămoș (containerul câmpului) | 2 |
| **fără indicator de focus, efectiv** | **3** |

`VERIFIED` — `audit/_tools/focus-measure.mjs`, raportul brut `audit/_tools/focus-report.json`.

Cele trei rămase:

| # | Selector | Descriere | Fix |
|---|---|---|---|
| F-1 | `home/Studio.tsx:149` | câmpul de căutare de pe pagina de start: `outline-none`, fără inel; containerul `<label>` are doar `focus-within:bg-s3` (o schimbare de fundal, fără inel) | adăugați `focus-within:ring-2 focus-within:ring-acc` pe `<label>` (același idiom ca `auth-field.tsx:44`) |
| F-2 | `home/Catalog.tsx:126` | câmpul de căutare din catalog | idem |
| F-3 | `ui-app.tsx:674-680` (`inputBase`) vs. `home/Catalog.tsx:126` | câmpul de căutare din catalog folosește `inputBase` **dar îl înlocuiește** cu `min-w-0 flex-1 bg-transparent … outline-none` — deci moare intenționat inelul de focus | idem |

Cele două câmpuri de autentificare (`/login`, `/register`, `/forgot-password`, `/reset-password`) **sunt corecte**: inputul nu are inel (`outline-none!`), dar containerul `FieldShell` are `focus-within:ring-acc` (`web/src/pages/auth-field.tsx:44`). Măsurat live:

```
input#email  →  box-shadow: none
FieldShell   →  box-shadow: … rgb(107, 229, 152) 0px 0px 0px 2px …
                --tw-ring-shadow: 0 0 0 calc(2px + 0px) #6be598
```
`VERIFIED` — captura `audit/screenshots/a11y-login-email-focused.png`.

**Verdict:** sistemul de focus este **consistent și bine executat**. Nu există niciun control fără indicator, în afară de cele două câmpuri de căutare. Singura abatere de la regula „inel verde de 2 px" este câmpul de căutare — și acolo e o inconseciență, nu o uitare: `inputBase` (`ui-app.tsx:674`) pune inelul, dar câmpul de căutare îl șterge.

### 5.3 Dimensiunea țintelor — WCAG 2.2 AA 2.5.8 (minim 24×24 CSS px)

Măsurat din DOM (`getBoundingClientRect`), pe toate paginile.

| # | Selector | Dimensiune | Text | Criteriu | Fix |
|---|---|---|---|---|---|
| T-1 | `admin/Staff.tsx` — `input[type=checkbox].size-4` (42 de casete: 2 roluri × 21 permisiuni) | **16×16** | — | 2.5.8 *Target Size (Minimum)* (AA) | `size-4` → `size-6` (24×24), sau `size-5` + `p-1` pe `<label>` |
| T-2 | `app/Tickets.tsx` — `a.block.truncate.font-bold` (titlul fiecărui ticket, 11 elemente) | înălțime **21** | „Panel check 2026-10-23T08:16:11", „My Discord bot keeps crashing…" | 2.5.8 | `py-1` pe rând, sau `min-h-11` pe link |
| T-3 | `app/Overview.tsx:307` — linkul numelui instanței | **145.2×23.3** | „Discord Bot" | 2.5.8 | `py-1` |
| T-4 | `app/InstanceDetail.tsx` — linkul „Instances" | **62.8×19.5** | „Instances" | 2.5.8 | `py-1` |
| T-5 | `app/ProductPage.tsx:147` — linkul „← Back to the catalog" | **147×20** | „← Back to the catalog" | 2.5.8 | `py-1` |
| T-6 | `home/Catalog.tsx:126` — numele produsului în card | **172×23** | „WordPress", „Code Server" | 2.5.8 | `py-1` |
| T-7 | `home/Catalog.tsx:126` și `home/Studio.tsx:149` — câmpul de căutare | **228×24** / **155×23** | „Search apps and databases" | 2.5.8 (înălțimea) | câmpul e într-un `<label>` de 48 px, deci ținta reală e 48 px; totuși inputul trebuie să aibă `h-full` |
| T-8 | `/` și `/apps` — câmpul de căutare | **503×21** / **320×24** | „Search apps and databases" | 2.5.8 (înălțimea) | idem |

`VERIFIED` — `audit/_tools/a11y-report.json`, câmpul `small`; măsurători re-verificate în `audit/_tools/tab-dump.mjs`.

**Observație corectă asupra țintelor mari:** butoanele principale au `h-11` (44 px), casetele de permisiuni sunt singurele cu adevăr sub prag, iar rândurile de listă sunt la 21-23 px. Butoanele de jos ale barei de telefon au `min-h-[56px]`, confortabil peste prag.

### 5.4 Etichetele câmpurilor

Pe 29 de pagini, **zero câmpuri fără etichetă** — cu o singură excepție parțială:

`/app/settings` — cele **5** casete de notificare (`Product news`, `Billing`, `Support`, `Service incidents`, `Offers`) au eticheta într-un `<label>` care **înglobează** textul descriptiv, dar caseta în sine nu are `id`/`for`, deci nu are `aria-label` și nu este legată semantic. Textul vizibil al etichetei este oricum accesibil (e în `<label>`), dar cititorul de ecran nu o anunță ca „Product news, checkbox, bifat". `VERIFIED` (măsurat: `accessibleName` gol pentru toate cele 5).

Fix: `id` pe casetă + `htmlFor` pe `<label>`, sau `aria-label` pe casetă.

Restul formularului e bine: `Field` (`ui-app.tsx:612`) leagă eticheta de input prin `htmlFor`/`id` și pune mesajul de eroare într-un `role="alert"` legat prin `aria-describedby`. `AuthField` (`auth-field.tsx:130`) face același lucru, cu `aria-invalid`.

### 5.5 Anunțarea erorilor

`role="alert"` e folosit **consistent**: 29 de apariții, toate cu `bg-bad/10` sau `bg-bad/12` și `text-bad`. Contrastul `text-bad` pe `bg-bad/12` peste `s2` = 5.18, peste `bg` = 6.27. Ambele trec. `VERIFIED`

**Lipsă:** pe 9 pagini, mesajul de eroare e într-un `role="alert"` **fără** `aria-describedby` legat de inputul corespunzător (doar `auth-field.tsx:164` leagă). Pentru un cititor de ecran, alerta e anunțată, dar focalizarea nu e mutată pe câmpul cu probleme și relația cauză↔câmp nu e exprimată. `CODE-INSPECTED`

### 5.6 Structura landmark-urilor

| | rezultat |
|---|---|
| pagini cu `<main>` | **30 / 30** |
| pagini cu `<header>` | 30 / 30 |
| pagini cu `<nav>` etichetat | 30 / 30 |
| pagini cu `<footer>` | 30 / 30 |
| `lang` pe `<html>` | `en` pe toate |
| pagini cu mai mult de un `<h1>` | 0 |

`VERIFIED` — `audit/_tools/a11y-report.json`, câmpurile `landmarks` și `headings`.

**Lipsă:** pe 30 de pagini există **câte un singur landmark `<nav>` principal**, dar `AppShell` (`ui-app.tsx:120`) adaugă navigația de desktop **și** bara de jos a telefonului, ambele `<nav>`. Verificarea etichetelor arată că sunt distincte (`"All pages"`, `"Primary"`), deci 2.4.1 *Bypass Blocks* e satisfăcut. `VERIFIED`

### 5.7 Mișcarea și `prefers-reduced-motion`

Vezi §2.4. Rezumat: clasele proprii sunt oprite corect; **166** de elemente cu utilitare Tailwind continuă să animeze. Nu e o încălcare AA, ci o neconcordanță internă.

### 5.8 Rezumatul accesibilității

| Criteriu | Stare | Dovezi |
|---|---|---|
| 1.4.3 Contrast (Minimum) | **1 cauză, 63 de elemente, 20 de pagini** | `--ink-3` pe 3 suprafețe; **zero** alte eșecuri |
| 1.4.11 Non-text Contrast | ok | inelul verde 2.78:1 peste `bg`… **de verificat**: raportul inelului `--acc` pe `--bg` = 12.55, peste `--s2` = 10.76 — peste 3:1 |
| 1.4.1 Use of Color | 1 caz | câmpul de căutare își schimbă doar fundalul la focus |
| 2.4.7 Focus Visible | **3 controale** fără indicator efectiv (2 câmpuri de căutare) |
| 2.4.11 Focus Not Obscured | ok | inelul are `outline-offset: 3px`, nu e acoperit |
| 2.5.8 Target Size (Minimum) | **42 de casete** la 16×16 + 4 rânduri sub 24 px |
| 1.3.1 Info and Relationships | 5 casete fără legătură etichetă↔input | 
| 3.3.2 Labels or Instructions | ok | 0 câmpuri fără etichetă pe 28 de pagini |
| 4.1.3 Status Messages | parțial | `role="alert"` prezent peste tot, dar 9 pagini nu leagă alerta de input |
| 2.4.1 Bypass Blocks | ok | `<main>` + `<nav>` etichetat pe toate |
| 1.4.4 Resize Text | ok | `text-[Npx]` pe scală fluidă, fără `px` fix pe text |
| 2.3.3 Animation from Interactions | parțial (AAA) | cele 166 tranziții rămase |

---

## 6. Consistența: același concept, desenat la fel?

### 6.1 Ce e consistent (măsurat)

| Concept | Verdict | Dovezi |
|---|---|---|
| Butonul principal | **consistent** | `PrimaryButton` (`ui-app.tsx:756`) = `bg-acc` + `text-on-acc` + `h-11` + `rounded-full`; același set de clase apare literal în `routes.tsx:215`, `app/Overview.tsx:60`, `app/Deploy.tsx:97`, `app/InstanceDetail.tsx:379,416` |
| Butonul secundar | **consistent** | `SoftButton` = `bg-s3` + `text-ink` + `hover:bg-line`; aceleași clase în `ui-app.tsx:781` și `app/Overview.tsx:62` |
| Butonul periculos | **inconsistent** | `DangerButton` (`ui-app.tsx:798`) = `bg-bad/12` + `text-bad` (5.18, trece). Dar dialogul (`ui-app.tsx:1023`) = `bg-bad` + `text-white` (2.78, **pică**) și `admin/Overview.tsx:192` = `bg-bad` + `text-ink` (2.55, **pică**). **Trei reprezentări ale aceluiași buton periculos, una dintre ele inaccesibilă.** |
| Indicatorul de focus | **consistent**, cu 2 excepții | inel verde 2 px peste tot (§5.2) |
| Starea de eroare | **inconsistent în nuanță** | `bg-bad/10` în 20 de locuri, `bg-bad/12` în 9 (`app/Deploy.tsx:586,654,659,726`, `app/InstanceDetail.tsx:361,445,546,563,695`, `app/Billing.tsx:189`, `app/Domains.tsx:228,385`, `app/instance/FilesTab.tsx:489,519`) |
| Starea goală | **consistent** | `EmptyState` (`ui-app.tsx:487`) e folosit în toate listele |
| Pastila de stare | **consistent** | `StatusPill` (`ui-app.tsx:573`) cu aceeași mapare de culori (`ui-app.tsx:560-572`) |
| Suma cu monedă | **consistent** | `Money` (`ui-app.tsx:591`) |
| Suprafața unui card | **inconsistent** | patru raze arbitrare: `rounded-[22px]`, `rounded-[24px]`, `rounded-[26px]`, `rounded-[28px]`, `rounded-[32px]` — fără token |
| Formatul datei | **inconsistent** | „23 Oct 2026" / „23 Oct 2026, 04:15" / „23 Oct 2026, 07:20" în pagini diferite; nu există un `DateFormat` |
| Barele de scroll | **consistent** | `index.css:140-159`, o singură definiție |

### 6.2 Concluzia pe consistență

Design system-ul **este** un sistem: există token-uri, există componente, există un idiom recunoscut (pastilă, inel verde, buton-pill, `role="alert"`). Un designer nou ar produce pagini care arată ca ale celor existente.

Problemele sunt **la margine**, nu în centru: trei butoane periculoase desenate în trei feluri, patru nuanțe ale aceluiași roșu de alertă, patru raze de card, trei formate de dată. Niciuna nu strică interfața; toate fac ca „același lucru" să arate altfel în două locuri — exact tipul de divergență pe care o audită de consistență trebuie să o raporteze.

---

## 7. Inventarul problemelor de design system

| ID | Sev | Problemă | Fișier | Verificare |
|---|---|---|---|---|
| DS-01 | **Mare** | `--color-ink3` = `#7b827b` nu trece 4.5:1 pe `--s2` (4.31), `--s3` (3.80) și `--acc-bg` (3.92). **63 de elemente pe 20 de pagini** | `web/src/index.css:49` | `VERIFIED` |
| DS-02 | **Mare** | Butonul de confirmare al dialogului: alb pe `--bad` = 2.78:1 | `web/src/ui-app.tsx:1023` | `VERIFIED` |
| DS-03 | **Mare** | Butonul periculos din panoul de staff: `--ink` pe `--bad` = 2.55:1 | `web/src/admin/Overview.tsx:192` | `CODE-INSPECTED` |
| DS-04 | **Mediu** | 42 de casete de permisiuni la 16×16 px | `web/src/admin/Staff.tsx` | `VERIFIED` |
| DS-05 | **Mediu** | Două câmpuri de căutare fără indicator de focus | `web/src/home/Studio.tsx:147-151`, `web/src/home/Catalog.tsx:123-127` | `VERIFIED` |
| DS-06 | **Mediu** | Lipsesc `Alert`/`Banner`, `Tabs`, `Progress`, `DateFormat`, `Card`, `Checkbox`, `Tooltip`, `Pagination`, `Breadcrumb` | — | `CODE-INSPECTED` |
| DS-07 | **Mediu** | Butonul periculos are trei reprezentări (`bg-bad/12`, `bg-bad`+alb, `bg-bad`+`ink`) | `ui-app.tsx:798,894,1023`, `admin/Overview.tsx:192` | `CODE-INSPECTED` |
| DS-08 | **Mediu** | `prefers-reduced-motion` nu oprește cele 166 de tranziții Tailwind | `web/src/index.css:183-187` | `VERIFIED` |
| DS-09 | **Mediu** | 5 casete de notificare fără legătură etichetă ↔ input | `web/src/app/Settings.tsx` | `VERIFIED` |
| DS-10 | **Mic** | `bg-bad/10` și `bg-bad/12` coexistă (29 de blocuri de eroare) | tot arborele `web/src` | `CODE-INSPECTED` |
| DS-11 | **Mic** | 5 raze de card arbitrare, fără token | tot arborele `web/src` | `CODE-INSPECTED` |
| DS-12 | **Mic** | 3 formate de dată, fără componentă comună | `app/InstanceDetail.tsx`, `app/Tickets.tsx`, `app/TicketDetail.tsx` | `CODE-INSPECTED` |
| DS-13 | **Mic** | Bloco `@font-face` Proxima Nova → trei 404 la fiecare încărcare | `web/src/index.css:15-35` | `VERIFIED` |
| DS-14 | **Mic** | Setul de pictograme nu are „copiere", „încărcare", „fileră", „săgeată sus/jos" | `web/src/icons.tsx` | `CODE-INSPECTED` |
| DS-15 | **Mic** | 9 pagini: alerta de eroare nu e legată de input prin `aria-describedby` | tot arborele `web/src` | `CODE-INSPECTED` |

---

## 8. Ce e bine, și trebuie spus

Sistemul **nu** e o stivă de stiluri ad-hoc, și merită spus limpede, pentru că auditul nu trebuie să inventeze probleme:

- **Indicatorul de focus e unul dintre cele mai bine făcute pe care le-am măsurat.** Două straturi (bază + inel), un singur token, `outline-offset` care nu e acoperit, `ring-inset` unde trebuie, și o excepție documentată în cod înainte de a fi scris (`index.css:78-83`).
- **`ConfirmDialog` e o implementare corectă** (`ui-app.tsx:907`): `role="dialog"`, `aria-modal`, `aria-labelledby`, focus mutat pe panou, capcană de focus implementată manual (`ui-app.tsx:950-966`), `Escape` pentru anulare, focusul înapoi pe controlul care a deschis dialogul (`ui-app.tsx:972`), scrollul paginii blocat. Multe biblioteci făcute mai prost.
- **Contrastul e corect peste tot, cu o singură excepție de token.** 11 culori de text × 5 suprafețe, 22 de perechi trec, una nu — și e una singură, nu un haos.
- **`prefers-reduced-motion` e implementat, nu decorativ** — și oprește exact ce trebuie: `bm-float` (6 s, infinit) e oprit, `scroll-behavior: smooth` devine `auto`.
- **Token-urile sunt folosite, nu doar declarate.** Nu am găsit în `web/src` nicio culoare hex care să nu fie în `@theme`.
- **Normalizarea greutăților de font** (`medium`→400, `black`→700) evită sinteza de către browser. Detaliu bun, rar întâlnit.

---

## 9. Fișierele de măsură

| Fișier | Ce măsoară |
|---|---|
| `audit/_tools/a11y-measure.mjs` | contrastul, țintele, etichetele, landmark-urile, titlurile |
| `audit/_tools/focus-measure.mjs` | indicatorul de focus al fiecărui control |
| `audit/_tools/tab-dump.mjs` | `box-shadow` brut al fiecărei opriri din ordinea de tabulare |
| `audit/_tools/motion-check.mjs` | `prefers-reduced-motion`, inelul câmpului de autentificare |
| `audit/_tools/danger-measure.mjs` | butoanele pe roșu, măsurate cu dialogul deschis |
| `audit/_tools/ring-debug.mjs` | variabilele inelului (`--tw-ring-shadow`, `--tw-ring-color`) pe un control focalizat |
| `audit/_tools/a11y-report.json` | raportul brut (contrast, ținte, câmpuri) |
| `audit/_tools/focus-report.json` | raportul brut (focus) |
| `audit/_tools/downscale.mjs` | micșorează capturile de telefon la o treime, ca artefactul să nu fie greu |

Toate rulează pe VM 103 și nu scriu nimic pe server: măsurătorile sunt `getComputedStyle` și `getBoundingClientRect` peste pagini deja servite.

**Documentele sursă ale acestui audit:** `06-route-matrix.md` (rutele), `06-customer-journeys.md` (călătoriile), `06-ux-ui-complete.md` (recenzia pe rute), `06-design-improvement-backlog.md` (backlogul cu ID-urile `UX-01`…`UX-28`).
