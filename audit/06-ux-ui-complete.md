# 06 — Recenzia completă UX/UI, rută cu rută

**Data:** 2026-10-23 · **Sistem:** `https://blipmade.com`, commit `7df3973` · **Lățimi măsurate:** 320, 360, 375, 390, 430, 440 px (telefon), 1280 px (desktop mic), 1920 px (desktop mare).

**Metodă:** scriptul `audit/_tools/browser-mobile-audit.mjs` (o variantă a `scripts/ops/browser-mobile-real.mjs` de pe VM 103, cu sesiunea preluată din `audit/_tools/session-bootstrap.mjs` în locul unei autentificări) măsoară **lățimea viewport-ului de layout**, lățimea vizuală, lățimea zonei de derulare și lățimea barei de navigație la fiecare rută și la fiecare lățime; plus o parcurgere de capturi la 1280 px și 1920 px (`audit/_tools/route-inventory.mjs`, `audit/_tools/desktop-long.mjs`). Contrastul, țintele, etichetele și indicatorul de focus au fost măsurate separat (`audit/_tools/a11y-measure.mjs`, `audit/_tools/focus-measure.mjs`).

Severități: **S1** — împiedică clientul să facă ce a venit să facă; **S2** — degradează serious o călătorie; **S3** — deranjează; **S4** — cosmetic.

---

## 0. Starea de pornire: defectul de tăiere pe telefon **nu s-a recurs**

`docs/MOBILE_AND_TYPOGRAPHY_FIX.md` a descris tăierea paginilor pe telefon. Verificarea de azi:

| zonă | rute | lățimi | măsurători | tăieri |
|---|---|---|---|---|
| client | 10 | 320/360/375/390/430/440 | 60 | **0** |
| staff | 12 | 320/360/375/390/430/440 | 72 | **0** |
| public | 10 | 320/360/375/390/430/440 | 60 | **0** |

La fiecare măsurătoare: `layout == visual == scroll == width`, `sideways=false`, iar bara de navigație are lățimea ecranului. **Defectul de tăiere ține, pe toate cele 32 de rute și toate cele șase lățimi.** `VERIFIED`

Singurul „element care trece de margine" raportat de sweep pe pagina de pornire (`div.whitespace-nowrap.will-change-transform`, 3832 px într-o cutie de 320) este **benzile decorative care se deplasează cu derularea** (`home/Ticker.tsx`): strămoșul are `overflow-hidden` și `aria-hidden="true"`, iar când `prefers-reduced-motion: reduce` e activ, `useReducedMotion()` oprește deplasarea. **Nu e un defect.** `VERIFIED` — `audit/screenshots/mobile/pub-320-.png`.

Pe pagina instanței, singurul „element care trece de margine" raportat de sweep (`span.break-words` la 444 px) e tot un **fals pozitiv**: strămoșul `p.truncate` are `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap` și taie corect textul cu trei puncte („provisioni…", „Instance is o…", „Started at st…"). `VERIFIED` — `audit/screenshots/inst-320-activity.png`.

**Banda de taburi a instanței e corectă**: `overflow-x: auto`, `scrollWidth` 1092 px într-un `clientWidth` de 328 px la 320, 398 px la 430 — derulează, nu taie. `VERIFIED`

**Tipografia:** `GET /healthz` raportează `fonts.installed: false` și `fallback: "Geist Variable"` — adică **Geist Variable și Geist Mono Variable sunt cea folosită**, iar Proxima Nova e doar cerută și nu livrată. `VERIFIED` (vedi `06-design-system.md`, §2.2).

**Ceea ce a rămas după reparație:** nu mai e tăiere, ci **s-au descoperit trei lucruri noi**, la alt nivel:

1. **Defectul cel mai grav e pe desktop**, nu pe telefon (tabelele, §1).
2. Pe telefon, **bara fixă de jos e tratată corect** (`main` are `padding-bottom: 128px` pentru o bară de 71 px) — nimic nu rămâne ascuns. `VERIFIED`
3. **Țintele mici** au rămas: 42 de casete la 16×16 px pe `/admin/staff` și patru linkuri de text la 20–23 px (vezi §2, UX-07).

---

## 1. Defectul cel mai grav: `DataTable` rupe modelul de tabel

### 1.1 Ce se întâmplă

`web/src/ui-app.tsx:1035-1075`:

```jsx
<table className="w-full border-collapse text-left">
  <thead>
    <tr>{columns.map((column) => <th key={column.key} scope="col" …>{column.header}</th>)}</tr>
  </thead>
  <tbody className="grid gap-1.5">          {/* ← aici */}
    {rows.map((row) => (
      <tr key={rowKey(row)} className="rounded-2xl bg-s2">
        {columns.map((column) => <td key={column.key} …>{column.render(row)}</td>)}
      </tr>
    ))}
  </tbody>
</table>
```

`<tbody>` primește `display: grid`. **Un `<tbody>` care devine grid iese din modelul de tabel**: `<thead>` rămâne calculat de algoritmul de tabel al browserului (coloanele se împart după cea mai lată celulă din *toate* rândurile), în timp ce fiecare `<tr>` devine un rând cu coloane **auto-dimensionate după conținut**. Cele două grile nu au nimic în comun.

### 1.2 Măsurătoarea

La 1280 px, pe fiecare tabel: poziția `x` a fiecărei celule de antet, comparată cu poziția celulei de același rând.

| Rută | `tbody.display` | decalajul maxim antet↔corp | antet | corp (primul rând) |
|---|---|---|---|---|
| `/app/instances` | `grid` | **557 px** | Instance@296/661 · Status@957/79 · Limits@1036/79 · Price@1115/70 · Node@1185/61 | Discord Bot@296/104 · online@400/82 · 512 MB@482/235 · €1.72@717/133 · —@850/36 |
| `/admin/audit` | `grid` | **562 px** | Time@316/707 · Actor@1023/63 · Action@1086/70 · Target@1156/70 | 23 Oct 2026@316/145 · q***@example@461/152 · auth.login@613/99 · user·cmvkb@712/264 |
| `/admin/orders` | `grid` | **499 px** | Number@316/574 · Customer@890/86 · Items@976/63 · Total@1038/63 · Status@1101/70 · Date@1171/55 | BM-00005@316/75 · Stefan Pauns@391/114 · Discord Bot@505/115 · €1.72@619/66 · awaiting pay@685/122 · 23 Oct 2026@808/83 |
| `/admin/customers` | `grid` | **424 px** | Customer@316/399 · Instances@715/93 · … · Created@1148/78 | Browser Cust@316/159 · 1@475/32 · 0@507/32 · 0@540/32 · €1.49@572/66 · Verified@638/90 · 23 Oct 2026@728/59 |
| `/admin/staff` | `grid` | **420 px** | Member@316/604 · Role@920/74 · Title@994/85 · Permissions@1079/147 | Administrator@316/184 · admin@500/82 · Administrator@581/111 · 0/21@692/69 |
| `/admin/products` | `grid` | **393 px** | Product@316/430 · Category@746/86 · … · Action@1156/70 | WordPress@316/96 · web cms@412/51 · €1.49@464/66 · 512 MB@530/54 · Visible@584/101 · Not deployable@685/129 · Delete@814/100 |
| `/app/tickets` | `grid` | **345 px** | Subject@316/548 · Number@864/70 · Category@935/86 · Status@1020/70 · Last reply@1090/81 · Open@1171/55 | Audit journey…@316/235 · #48@551/49 · Technical@600/84 · Open@685/75 · No replies yet@760/67 · →@826/68 |
| `/admin/services` | `grid` | **301 px** | Instance@316/410 · Customer@726/86 · … · Action@1156/70 | Browser instance@316/139 · b***@455/159 · 512 MB@614/54 · €1.49@668/66 · online@734/82 · 15@816/39 · Retry provisioning@855/137 |
| `/admin/tickets` | `grid` | **105 px** | Ticket@316/164 · Status@480/70 · Assigned@550/86 | #48 Audit…@316/264 · open@580/75 · —@655/37 |

`VERIFIED` — `audit/_tools/tablescope.mjs`, ieșirea brută în `audit/_tools/`.

**Niciun tabel al produsului nu are antetul aliniat cu corpul.** Pe `/app/tickets`, antetul „Subject" (x=316, lățime 548) stă deasupra coloanei „Number" a corpului (care începe la x=551); antetele „Last reply" și „Open" (x=1090–1226) plutesc în spațiul gol din dreapta fiecărui rând (care se termină la x=894). `audit/screenshots/long-ticket-list-1280.png`.

### 1.3 Consecința: rândul lung rupe rândul, nu doar tabelul

Pe rândul real al ticketului **#42** („My Discord bot keeps crashing after the latest update and I cannot open the console to read the logs" — 100 de caractere, există în baza de date):

```
rowW = 548   rowScrollWidth = 1027   overflow = 479 px
celule:  subject@316 w=684 right=1000 | #42@1000 | Technical@1049 | Open@1133 | No replies yet@1208 right=1275 | →@1275 right=1343
```

Deci rândul iese cu **479 px** din cutia lui, iar **fundalul rândului (`rounded-2xl bg-s2`) se oprește la x=864, în mijlocul conținutului**. Ultima coloană ajunge la x=1343, în afara tabelului vizibil (containerul e la 910 px lățime, cu derulare la 1027). `VERIFIED` — `audit/screenshots/long-ticket-list-1280.png`.

**Pe telefon nu se întâmplă**, pentru că `DataTable` e `hidden md:block` și telefonul primește `CardList`, unde subiectul e trunchiat corect cu trei puncte („Audit journey probe 2026-10-…"). `VERIFIED` — `audit/screenshots/long-ticket-list-320.png`.

### 1.4 Fixul

În `web/src/ui-app.tsx:1058-1071`:

```jsx
// înainte: <tbody className="grid gap-1.5">
<table className="w-full border-separate border-spacing-y-1.5 text-left">
  <thead>
    <tr>{columns.map((column) => (
      <th key={column.key} scope="col"
          className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
        {column.header}
      </th>
    ))}</tr>
  </thead>
  <tbody>                       {/* <tbody> rămâne table-row-group */}
    {rows.map((row) => (
      <tr key={rowKey(row)} className="rounded-2xl bg-s2">
        {columns.map((column) => (
          <td key={column.key}
              className={cn('px-3 py-3 align-middle text-[14px] text-ink',
                            column.className, 'max-w-[22rem] truncate')}>
            {column.render(row)}
          </td>
        ))}
      </tr>
    ))}
  </tbody>
</table>
```

`border-separate` + `border-spacing-y-1.5` păstrează spațiul dintre rânduri pe care îl dă `gap-1.5`, fără să scoată `<tbody>` din modelul de tabel. `truncate` + `max-w-[22rem]` împiedică un subiect lung să lărgească coloana. **Severitate S1** — afectează 9 rute și 22 de tabele, și este exact coloana după care clientul caută.

---

## 2. Problemele comune tuturor rutelor

### UX-01 · S1 · Adresa instanței nu se vede — `/app/instances/:id`

Antetul paginii spune **„No public URL yet"**, dar adresa există: `10.77.0.11:30001` (alocarea de pe panou). API-ul o are în `GET /api/instances/:id/allocations`, iar interfața o afișează în tabul **„Network"**, al șaselea dintre douăsprezece. `api/src/routes/instances.ts:33-36` calculează `url` **doar** dintr-un domeniu `ACTIVE`, deci antetul nu vorbește despre adresa de serviciu.

**Fix:** în antetul instanței (`web/src/app/InstanceDetail.tsx:675-685`), arată rândul de alocare primară (`10.77.0.11:30001`) ca text secundar, cu un link „Network"; păstrează „No public URL yet" doar pentru adresa HTTPS și redenumește-l „No public domain yet".

### UX-02 · S1 · Două stări contrazicătoare pe același ecran — `/app/instances/:id`

Pastila din antet spune **„Online"** (starea din baza de date). Tabul „Overview" spune, imediat sub ea, **„Container: offline"**, cu MEMORY 0 B, DISK 8.6 KB, PROCESSOR 0%, UPTIME 0 m. `GET /api/instances/:id/metrics` → `{"state":"offline","cpuAbsolute":0,"memoryBytes":0,"uptimeMs":0,"diskBytes":8814}`. `VERIFIED` — `audit/screenshots/tab-console.png`.

**Fix:** `StatusPill` (`web/src/ui-app.tsx:573`) ar trebui să primească starea reală a containerului, nu starea rândului. Minim: când `metrics.state !== 'online'`, antetul afișează pastila de starea containerului și adaugă o linie „Provisioned on {date}. The container reports {state}."

### UX-03 · S2 · Catalogul pare gol cât timp se încarcă — `/apps`

Starea de încărcare a catalogului este **8 dreptunghiuri goale** (`Skeleton h-[190px]`), fără text, fără strălucire, fără indicator — identice cu 8 carduri de produs fără conținut. Timpul real e sub un secundă (`firstText` 523–596 ms, de trei ori). `VERIFIED` — `audit/screenshots/apps-catalog-1280.png` (încărcare) vs. `audit/screenshots/apps-check-1280.png` (cu conținut).

**Fix:** `Skeleton` (`web/src/ui-app.tsx:469`) primește un `animate-pulse` și un `aria-label="Loading the catalog"`; alternativa mai bună: `LoadingBlock rows={3} label="Loading the catalog"` (`web/src/ui-app.tsx:473`), care există deja și e folosit peste tot.

### UX-04 · S2 · Butonul „Retry" nu reîncearcă — toate rutele de staff

`ErrorState` (`web/src/ui-app.tsx:532`) are eticheta **hard-codată** pe „Retry". Gardul de staff o folosește cu `onRetry={() => navigate('/app')}` (`web/src/routes.tsx:145-153`), deci pe toate cele 13 rute de staff, un client vede butonul **„Retry"** care îl duce în panoul client. `VERIFIED` — `route-report.json`, `errorHits: ['Retry']`.

**Fix:** `ErrorState` primește o prop `actionLabel` (implicit „Retry"), iar gardul trece `actionLabel="Back to your dashboard"`.

### UX-05 · S2 · Catalogul e cerut de cinci ori pe pagina de pornire — `/`

`GET /api/catalog/products` × 5 pe `/`, × 2 pe `/apps`. `VERIFIED` — jurnalul de rețea.

Cauza: `web/src/lib/pricing.ts:31-38` memorează în cache **rezultatul**, nu **promisiunea în curs**. Patru montări de `useCatalogSummary()` (`home/Nav.tsx:24`, `home/Rest.tsx:20`, `home/Hero.tsx:12`, `home/Hero.tsx:37`) pornesc simultan, fiecare cu propriul `get()`, plus `home/Catalog.tsx:51` cu un `useAsync` propriu.

**Fix:** în `pricing.ts`, `load()` trebuie să memoreze promisiunea:

```ts
let inflight: Promise<CatalogProduct[]> | null = null;
async function load(): Promise<CatalogProduct[]> {
  if (inflight) return inflight;
  if (cached && Date.now() - cached.at < 60_000) return cached.products;
  inflight = get<{ products: CatalogProduct[] }>('/catalog/products')
    .then((r) => { cached = { products: r.products, at: Date.now() }; for (const l of listeners) l(r.products); return r.products; })
    .finally(() => { inflight = null; });
  return inflight;
}
```

### UX-06 · S2 · Zona de client nu cere rolul de client — `/app/*`

`area: 'customer'` verifică doar existența unei sesiuni (`web/src/routes.tsx:97`), nu rolul. Un cont de staff deschide `/app` și vade contul lui de client, **gol** — un „Overview" cu „No apps yet", fără nicio explicație. `VERIFIED`.

**Fix:** în `Guard` (`web/src/routes.tsx:123-160`), când `area === 'customer'` și `isStaff(user.role)`, redirecționează la `/admin` (staff-ul are deja interfața lui).

### UX-07 · S3 · Barele de jos de pe telefon sunt bine, dar țintele mici rămân

`main` are `padding-bottom: 128px` pentru o bară de 71 px — **nimic nu rămâne ascuns**. `VERIFIED`.

În schimb, țintele sub 24 px rămân:

| țintă | măsurătoare | rută |
|---|---|---|
| casetele de permisiuni | **16×16** (42 de bucăți) | `/admin/staff` |
| linkul numelui instanței | înălțime **23** | `/app` |
| linkul „Instances" | înălțime **20** | `/app/instances/:id` |
| linkul „← Back to the catalog" | înălțime **20** | `/apps/:slug` |
| casetele de notificare | 24×24 (la prag) | `/app/settings` |

**Fix:** `size-4` → `size-6` pe casetele de permisiuni (`web/src/admin/Staff.tsx`); `py-1` pe cele patru linkuri de text.

### UX-08 · S3 · 42 de blocuri de eroare, două nuanțe de roșu — toate rutele

`bg-bad/10` în 20 de locuri, `bg-bad/12` în 9 (`web/src/app/Deploy.tsx:586,654,659,726`, `web/src/app/InstanceDetail.tsx:361,445,546,563,695`, `web/src/app/Billing.tsx:189`, `web/src/app/Domains.tsx:228,385`, `web/src/app/instance/FilesTab.tsx:489,519`). `CODE-INSPECTED`

**Fix:** creează `--color-bad-soft` în `@theme` (`web/src/index.css:38-54`) și folosește-l peste tot.

### UX-09 · S3 · Trei butoane periculoase, trei reprezentări — toate rutele

`DangerButton` (`web/src/ui-app.tsx:798`) = `bg-bad/12` + `text-bad` (5.18:1, corect). Dialogul (`web/src/ui-app.tsx:1023`) = `bg-bad` + `text-white` (**2.78:1**, eșec). Panoul de staff (`web/src/admin/Overview.tsx:192`) = `bg-bad` + `text-ink` (**2.55:1**, eșec). `VERIFIED` pentru dialog (măsurat cu dialogul deschis, `audit/screenshots/a11y-confirm-dialog.png`).

**Fix:** adaugă `--color-on-bad: #2b0606` (7.34:1 pe `--bad`) și folosește-l în toate cele trei.

---

## 3. Recenzia pe rute

Format: **rută** · capturi · ce e greșit · severitate · fix în vocabularul design system-ului.

### 3.1 Public

| Rută | 320–440 | 1280 / 1920 | Ce e greșit | Sev | Fix |
|---|---|---|---|---|---|
| `/` | ✅ fără tăiere; benzile decorative se deplasează cu derularea, `overflow-hidden` + `aria-hidden` — **corect** | ✅ | 5 apeluri identice la catalog (UX-05); câmpul de căutare e la 21 px și n-are inel de focus; linkul „← Back to the catalog" la 20 px | S2 / S3 / S4 | `pricing.ts` (UX-05); `focus-within:ring-2` (UX-20); `py-1` (UX-17) |
| `/apps` | ✅ | ⚠️ starea de încărcare e indistinctă de un catalog gol | UX-03, UX-07, UX-20 | S2 / S3 | `LoadingBlock` / `Skeleton` cu `animate-pulse`; `focus-within:ring-2` pe `<label>` |
| `/apps/discord-bot` | ✅ | ✅ | prețul e clar înainte de orice acțiune — **bine** | S4 | `py-1` pe „← Back to the catalog" (20 px) |
| `/apps/wordpress` | ✅ | ✅ | „its image is not installed on the platform yet" — **onest și bine** | S4 | `py-1` pe link |
| `/docs` | ✅ | ✅ | fără probleme | — | — |
| `/status` | ✅ | ✅ | fără probleme | — | — |
| `/login` | ✅ | ✅ | câmpurile au inel verde pe container (`focus-within:ring-acc`), **bine**; numele produsului din carduri la 23 px | S4 | `py-1` pe link |
| `/register` | ✅ | ✅ | fără câmp de confirmare a parolei și fără acceptarea termenilor; numele produsului la 23 px | S4 | câmp `confirmPassword`; `py-1` |
| `/forgot-password` | ✅ | ✅ | trimiterea e blocată de transportul `file`; pagina nu spune nimic clientului | S3 | `Alert` de informare |
| `/deploy/:slug` | ✅ | ✅ | — | — | — |

### 3.2 Client

| Rută | 320–440 | 1280 / 1920 | Ce e greșit | Sev | Fix |
|---|---|---|---|---|---|
| `/app` | ✅ | ✅ | **nu avertizează** că adresa de e-mail nu e verificată (textul există doar în Setări) | S2 | `Alert` nou în `app/Overview.tsx`, cu `Link` spre `/app/settings` |
| `/app/instances` | ✅ | ❌ **antetul nu se aliniază cu corpul (decalaj 557 px)**; linkul numelui are 23 px înălțime | UX-01 (tabel), S2 | `DataTable` cu `border-separate` (§1.4); `py-1` pe link |
| `/app/instances/:id` | ✅ banda de 12 taburi e bandă de derulare (`overflow-x: auto`, 1092 px în 328) — **corect**; rândurile de activitate sunt trunchiate cu trei puncte — **corect** | ❌ „No public URL yet" în antet în timp ce adresa e la „Network"; „Online" vs „Container: offline"; 12 taburi fără grupare | S1 (adresa), S1 (stările) | §2 UX-01, UX-02 |
| `/app/deploy` | ✅ | ✅ | prețul se recalculează în timp real — **bine** | — | — |
| `/app/deploy/:slug` | ✅ banda de pași e `w-max` și derulează — **corect** | ✅ | formularul **nu are** câmp pentru imagine, comandă sau variabile de mediu; clientul plătește înainte să aleagă ce rulează | S2 | câmpuri noi în pasul 1, cu `TextInput` și `Select` din `ui-app.tsx` |
| `/app/domains` | ✅ | ✅ | starea goală e clară — **bine** | — | — |
| `/app/billing` | ✅ | ✅ | „CURRENT PERIOD ENDS —": câmpul există, valoarea e `null` (`currentPeriodEnd: null`, 0 subscripții) | S3 | câmpul trebuie să spună *de ce* e gol („No active subscription") |
| `/app/tickets` | ✅ carduri cu subiectul trunchiat — **corect** | ❌ **antet nealiniat cu corpul (345 px)**; rândul #42 iese cu 479 px din cutie | S1 | §1.4 |
| `/app/tickets/:id` | ✅ | ✅ | subiectul lung (100 de caractere) se îndoaie corect (`h2`, `overflow: 0`) — **bine** | — | — |
| `/app/settings` | ✅ | ✅ | 5 casete de notificare fără legătură etichetă↔input | S3 | `id` + `htmlFor` (sau `aria-label`) în `web/src/app/Settings.tsx` |

### 3.3 Staff

| Rută | 320–440 | 1280 / 1920 | Ce e greșit | Sev | Fix |
|---|---|---|---|---|---|
| `/admin` | ✅ | ✅ | butonul „Retry" care duce în panoul client | S2 | UX-04 |
| `/admin/customers` | ✅ | ❌ decalaj 424 px | S1 | §1.4 |
| `/admin/customers/:id` | ✅ | ✅ | e-mailul e mascat (`q***@example…`) — **bine pentru confidențialitate** | — | — |
| `/admin/orders` | ✅ | ❌ decalaj 499 px | S1 | §1.4 |
| `/admin/services` | ✅ | ❌ decalaj 301 px; **niciun link către instanță** — staff-ul nu poate inspecta o instanță | S1 (link), S1 (tabel) | rută nouă `/admin/services/:id`; §1.4 |
| `/admin/products` | ✅ | ❌ decalaj 393 px | S1 | §1.4 |
| `/admin/pricing` | ✅ | ✅ | câmpurile poartă id-ul intern în hash (`base-cmvjyo5yh0003dxtl58rz6pjt`) | S3 | `Field` cu etichete lizibile, `id` propriu |
| `/admin/tickets` | ✅ | ❌ decalaj 105 px; `table.w-full` la 320 px cu conținut de 1008 px (overflow 688 px) | S1 | §1.4 |
| `/admin/promotions` | ✅ | ✅ | starea goală „0 promotions" — **corectă** | — | — |
| `/admin/infrastructure` | ✅ | ✅ | „0 nodes, 0 eggs" — **corect** | — | — |
| `/admin/audit` | ✅ | ❌ decalaj **562 px** (cel mai mare) | S1 | §1.4 |
| `/admin/staff` | ✅ | ❌ decalaj 420 px; **42 de casete la 16×16 px** | S1 (tabel), S2 (ținte) | §1.4; `size-4` → `size-6` |
| `/admin/settings` | ✅ | ✅ | „0 settings" — **corect** | — | — |

---

## 4. Stările, pe rute

| Stare | Unde e implementată bine | Unde nu |
|---|---|---|
| **încărcare** | `Skeleton` cu `aria-busy="true"` și `role="status"`; `LoadingBlock` cu etichetă | `/apps`: scheletele arată ca un catalog gol (UX-03) |
| **goală** | `EmptyState` pe 9 din 10 rute de client și 6 din 13 de staff; fiecare are titlu, explicație și acțiune | niciuna |
| **eroare** | `ErrorState` cu `role="alert"`, mesaj, buton și `requestId` | eticheta „Retry" minte (UX-04); textul mesajului la `/api/auth/register` nu spune care câmp e greșit |
| **succes** | toast prin `ToastProvider` (`ui-app.tsx:872`) + reîncărcare | — |
| **text lung** | **telefon:** corect (carduri trunchiate cu trei puncte, `truncate`); **detaliul ticketului:** corect (`h2` se îndoaie) | **desktop:** rândul de tabel iese din cutie cu 479 px (§1.3) |

---

## 5. Capturile

| Set | Unde |
|---|---|
| telefon, client, 6 lățimi × 10 rute | `audit/screenshots/mobile/cust-{320,360,375,390,430,440}-*.png` |
| telefon, staff, 6 lățimi × 12 rute | `audit/screenshots/mobile/adm-{320,360,375,390,430,440}-*.png` |
| telefon, public, 6 lățimi × 10 rute | `audit/screenshots/mobile/pub-{320,360,375,390,430,440}-*.png` |
| desktop 1280, 36 de URL-uri × 3 roluri | `audit/screenshots/{anonymous,customer,staff}-*.png` |
| desktop 1920 | `audit/screenshots/w1920-*.png` |
| stări de eroare și de încărcare | `audit/screenshots/{error,loading}-*.png` |
| dovezi punctuale | `audit/screenshots/{apps-catalog-1280,apps-check-1280,long-ticket-list-1280,long-ticket-list-320,inst-320-activity,tab-console,tab-network,tab-files,tab-resources,a11y-confirm-dialog,table-align-1280}.png` |

---

## 6. Fișierele de măsură

| Fișier | Ce măsoară |
|---|---|
| `audit/_tools/browser-mobile-audit.mjs` | sweep-ul pe telefon (lățimea viewport-ului de layout, elemente care trec de margine, ținte mici) |
| `audit/_tools/route-inventory.mjs` | parcurgerea rutelor în trei roluri, cu stările de eroare și de încărcare |
| `audit/_tools/desktop-long.mjs` | capturile la 1920 și proba de conținut lung |
| `audit/_tools/tablescope.mjs` | alinierea antet↔corp în toate tabelele |
| `audit/_tools/long-real.mjs` | conținutul lung real (subiectul de 100 de caractere) și bara fixă de jos |
| `audit/_tools/instance-mobile-detail.mjs` | banda de taburi și rândurile de activitate pe telefon |
| `audit/_tools/a11y-measure.mjs`, `focus-measure.mjs` | contrast, ținte, etichete, focus |
