# Starea reală a producției — citire cu privilegii de inspecție

**Data:** 2026-10-24 - **Commit masurat inainte de deploy:** `main` @ `e990776`
**Commit live acum (deploy ulterior, autorizat de operator):** `remediation/phase-2-critical-fixes` @ `3ec6ab8`
**Metodă:** citire prin SSH pe VM 103. **Nicio valoare de secret nu este reprodusă** — se
raportează doar dacă variabila există, este goală sau lipsește.

Această pagină este baza documentului `GO-NO-GO-VERDICT.md`.

---

## 1. Dependențele de operator încă neîndeplinite

| Variabilă | Stare | Ce blochează |
|---|---|---|
| `STRIPE_SECRET_KEY` | **EMPTY** | nu se poate crea nicio sesiune de plată |
| `STRIPE_WEBHOOK_SECRET` | **EMPTY** | webhook-ul Stripe nu poate fi verificat |
| `STRIPE_PUBLISHABLE_KEY` | **EMPTY** | interfața nu poate deschide formularul de plată |
| `PAYMENTS_ENABLED` | `false` | poarta de plată refuză, corect |
| `SMTP_URL` | **EMPTY** | **niciun e-mail nu poate pleca**: nici verificare de cont, nici resetare de parolă, nici notificări de bilet |
| `OFFSITE_TARGET` / `OFFSITE_KEY` | **MISSING** | **nu există nicio copie a datelor în afara gazdei** |
| `DOMAIN_BASE` | **EMPTY** | instanțele nu au adresă publică |
| `CADDY_ADMIN_URL` / `_USER` / `_PASSWORD` | **EMPTY / MISSING** | provisionarea domeniilor nu poate funcționa |
| `C_node` | **MISSING** | valoarea nodului pentru panou, încă neclară |
| `TRUSTED_PROXIES` | **SET (dupa deploy)** - `127.0.0.1,::1,172.18.0.0/16` | inainte: **MISSING** (implicit `127.0.0.1,::1` - cauza radacina a `SEC-P1-02`); acum: subreteaua Docker masurata, `172.18.0.0/16` |
| `COOKIE_SECURE` | **MISSING** | se deduce din protocol; cu proxy-ul neîncrezut rezultă `http` → cookie **fără `Secure`** | - **remis in cod** (faza 13, `3b7e98d`): in productie cookie-ul e `Secure` oricum
| `PUBLIC_ORIGIN` | **MISSING** | derivat din altă parte; de verificat |
| `LOGIN_RATE_LIMIT_MAX` | **MISSING** | implicit 10 — valoarea mare e doar pe stiva izolată, **producția nu e afectată** |
| `PTERODACTYL_URL`, `PANEL_KEYMINT_URL`, `PANEL_KEYMINT_SECRET` | SET | panoul este configurat |
| `NODE_ENV` | `production` | — |

---

## 2. Catalogul din producție

```
slug             visible  deployable  are egg  are imagine
code-server      t        f            f       f
discord-bot      t        t            t       t
postgresql       t        f            f       f
uptime-kuma      t        f            f       f
wordpress        t        t            f       f      ← deployable=true, dar nu e deployabil
```

**Doar `discord-bot` este într-adevăr vândabil.** Patru produse nu au nici imagine, nici
egg: nu pot fi provisionate. `wordpress` — produsul care apare în pagina de start și în
materialul de marketing — este marcat `deployable = true` în baza de date, dar nu are
imagine și nu are egg: **marcajul din catalog nu corespunde realității**.

Prețurile existente (toate EUR):

```
slug             perioadă   sumă
code-server      MONTHLY    299
discord-bot      MONTHLY    149
postgresql       MONTHLY    449
uptime-kuma      MONTHLY    149
wordpress        MONTHLY    149
```

**Nu există niciun rând de preț anual** în producție.

### 2.1 Precizare asupra `FIN-P2-03`

`FIN-P2-03` a fost raportat ca „o cotare anuală de 1890 produce o comandă de 189".
Mecanismul de cod este real (`routes/orders.ts:71` → `buildQuote` fără perioadă →
`pricing.ts:422` → `priceItems(items)` implicit `MONTHLY`; `stripe.ts:214` fixează
`interval: 'month'`), **dar în producție impactul este latent, nu activ**:

- `loadPrice(productId, 'ANNUAL')` caută un rând `period = 'ANNUAL'`; nu există niciunul →
  `notFound('This product has no active price.')`.
- Așadar, azi, `POST /api/billing/quote` cu `period: 'ANNUAL'` **eșuează curat**, iar
  `POST /api/orders` nu acceptă deloc o perioadă și cotizează întotdeauna lunar.

**Verdict corectat: `FIN-P2-03` este o capcană latentă, nu o pierdere de bani în curs.**
Severitatea reală este **High**, nu Critical: devine pierdere de bani în clipa în care
cineva adaugă un preț anual în catalog — adică exact atunci când funcția se scoate la
vânzare. Defectul rămâne de reparat, dar raportul trebuie să spună adevărul despre
impact, nu despre o sumă care nu se pierde încă.

---

## 3. Datele de producție după curățare

| Tabel | Rânduri |
|---|---|
| `User` | 3 (toți reali) |
| `Session` | 42 (toate reale) |
| `Order` | 4 (toate ale operatorului) |
| `Ticket` | 1 (al operatorului) |
| `Invoice` | 0 |
| `Payment` | 0 |
| `Instance` | 0 |
| `Subscription` | 0 |
| `AuditLog` | 561 (dovada incidentului, păstrată) |

**Zero facturi, zero plăți, zero abonamente, zero instanțe.** Platforma nu a încasat
niciodată un ban și nu a servit niciodată un client cu infrastructură reală.

Servere pe panoul Pterodactyl: **0**. Toate cele 5 erau artefacte de audit.

---

## 4. Ce înseamnă acest lucru pentru verdictul comercial

Trei lucruri sunt adevărate simultan:

1. **Codul este într-o stare mult mai bună decât era acum o lună** — poarta de plată,
   poarta de capacitate, contractul de preț, modelul de disponibilitate, numerotarea
   atomică, plafonul de sesiuni, backupul programat. Toate măsurate, toate testate.
2. **Platforma nu poate încasa un ban azi** — cheile Stripe sunt goale, `SMTP_URL` este
   gol (deci niciun client nu poate nici confirma contul), `DOMAIN_BASE` este gol (deci
   instanța nu are adresă), iar 4 din 5 produse nu au imagine.
3. **Un singur eșec de gazdă pierde totul** — copia unică este pe același RAID 0, fără
   `OFFSITE_TARGET`. Drill-ul de restaurare a trecut (RTO ≈ 3 s), dar ceea ce se
   restaurează nu mai există după pierderea gazdei.

Verdictul trebuie să spună exact acest lucru: **nu este un GO**, dar nici nu este
respingerea proiectului. Este un **NO-GO de lansare, cu o listă de blocaje măsurate și
ordonate**, dintre care cele care țin de cod sunt deja reparate sau sunt în curs de
reparare în faza 13.


---

## 5. Deploy-ul ramurii de reparare (autorizat de operator)

**Autorizatie:** operatorul a raspuns "Da, aplica ramura in productie acum" la intrebarea
formulata dupa retestul fazei 13 si dupa fazele 14-15.

| Pas | Ce s-a facut | Rezultat |
|---|---|---|
| 1 | Copie de siguranta inainte de deploy | `/var/backups/blipmade/pre-deploy-phase15/prod-predeploy-20261024-025438.sql` - **32 tabele**, `sha256 7213e5f4...`; plus `env-predeploy-20261024-025438` |
| 2 | Lista de proxy-uri pentru API | `TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.0/16` adaugata in `.env` (subreteaua Docker `blipmade_default`, masurata) |
| 3 | Rebuild al imaginilor | `docker compose ... build` -> **exit 0** (`blipmade-api`, `blipmade-web`, `blipmade-worker`) |
| 4 | Repornirea stivei | `docker compose ... up -d` -> **exit 0**; 5 containere **healthy** |
| 5 | Verificarea codului deployat | in imaginea live: `addressRateLimitKey` (5 fisiere), `failedAttempts`, `DEAD_ORDER_STATUSES`, `assertMayActOnAccount` (2), `writeOrderInvoice`, `rateLimitKey` (2) si garda fazei 15 ("cannot be paid: its status is") |
| 6 | Verificarea serviciului | `http://10.77.0.13:3000/healthz` -> **200**; `http://10.77.0.13:3000/api/health` -> **200**, cu `database: true`, `redis: true` |
| 7 | Verificarea datelor | **neramificate**: 3 utilizatori, 42 sesiuni, 4 comenzi, 1 bilet, 0 facturi, 0 plati, 0 instante, 561 evenimente de audit - identice cu starea de dinaintea deploy-ului |

**Fara migrari noi** (`git diff main..rama -- api/prisma/migrations` = gol), fara schimbari de
dependinte si fara alte schimbari de `.env` in afara celei de mai sus.
