# GO / NO-GO — verdictul comercial

**Data:** 2026-10-24
**Platforma:** Blipmade — găzduire de servere de joc (Pterodactyl + Docker), serviciu găzduit pe `blipmade.com`
**Cod evaluat:** `main` @ `e990776`, apoi ramura de reparare `remediation/phase-2-critical-fixes`
**Producția:** VM 103 (10.77.0.13), containere docker `blipmade-{api,web,worker,postgres,redis}-1`
**Documentele de bază:** cele 14 rapoarte din `audit/post-remediation/` + dovezile brute din `_raw/`

---

## 1. Verdictul

> ## ⛔ **NO-GO** pentru lansare comercială.
>
> Platforma **nu poate încasa un ban azi**, **nu poate servi un client real**, **nu poate
> trimite un e-mail** și **pierde totul dacă pierde gazda**.
>
> Aceasta **nu este o respingere a proiectului**. Mecanismele sunt construite, testate și
> măsurate. Ce lipsește sunt, în cea mai mare parte, **chei, imagini, o adresă, un releu de
> e-mail și o copie a datelor în afara gazdei** — decizii și cheltuieli ale operatorului,
> nu cod.
>
> **Șase porți (G1–G6) sunt întregi, măsurate și închizibile.** Când sunt închise,
> lansarea este justificată de dovezi, nu de speranță.

### De ce nu este un GO

| # | Motiv | Cum a fost măsurat |
|---|---|---|
| 1 | **Nu se pot accepta plăți** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` sunt **goale**; `PAYMENTS_ENABLED=false`. În toată istoricul de producție: **0 facturi, 0 plăți, 0 abonamente**. |
| 2 | **Nu se poate servi niciun client** | Doar `discord-bot` este real deployabil. `code-server`, `postgresql`, `uptime-kuma` nu au nici imagine, nici egg. `wordpress` este marcat `deployable=true` **și nu are imagine**. `DOMAIN_BASE` este gol → instanța nu are adresă publică. |
| 3 | **Nu se poate contacta niciun client** | `SMTP_URL` este gol → nu pleacă niciun e-mail: fără verificare de cont, fără resetare de parolă, fără notificare de bilet. |
| 4 | **Pierderea gazdei = pierderea totală** | Copia unică este pe același RAID 0. `OFFSITE_TARGET` și `OFFSITE_KEY` lipsesc. **RPO la pierderea gazdei: ∞ (tot).** |
| 5 | **Nu există produsul de joc** | Platforma e dimensionată pentru servere de joc; catalogul nu are niciun produs de joc. Nu e o îmbunătățire, e **o intrare pe piață lipsă**. |
| 6 | **Hipervizorul e expus** | `root` cu parolă, `*:8006`, `rpcbind` pe `0.0.0.0:111`, firewall dezactivat. Pe gazda Proxmox, nu pe platformă. |

### De ce nu este un NO-GO definitiv

Măsurătorile arată că **mecanismele funcționează**:

- **329 de teste verzi** pe codul care rulează în producție: **API 325/325**, web **87/87**.
- **Contractul de preț ține**: configuratorul de deploy afișează **€2.39**, iar
  `POST /api/catalog/quote` pentru aceeași configurație întoarce `total: 239` EUR.
- **Remedierea tabelelor ține**: **0 px** decalaj antet↔corp în 60 de tabele cu date populate,
  **0 px** depășire orizontală în 192 de perechi rută × lățime.
- **Backupul e programat și e răsturnabil**: timer instalat și rulat, drill de restaurare
  executat — RTO ≈ **3 s** pentru baza de date.
- **Progresul real față de acum o lună**, măsurat: din 182 de constatări anterioare,
  **38 verificate reparate**, 14 parțial reparate; poarta de plată, poarta de capacitate,
  modelul de disponibilitate derivat din realitate, numerotarea atomică, plafonul de
  sesiuni, rezervarea atomică de campanie și compensarea provisionării eșuate sunt toate
  în cod și acoperite de teste de regresie.

---

## 2. Cele șase porți

O lansare este justificată când toate cele șase sunt închise și reverificate.

### G1 — Un client poate plăti, iar banii se conciliează
**Dependență: operator.** Chei Stripe live (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PUBLISHABLE_KEY`), `PAYMENTS_ENABLED=true`, o comandă reală de probă parcursă
până la factură.
**Criteriu de ieșire:** o comandă reală ajunge `PAID`, produce factură și abonament, iar
suma încasată este egală cu suma cotată. **Stare: neîndeplinită.** Mecanismele de cod
există și sunt testate (`api/tests/phase2-payment-safety.test.ts`).

### G2 — Un client poate folosi ce a plătit
**Dependență: operator.** Imagine și egg reale pentru produsul vândut, `DOMAIN_BASE`,
credențiale Caddy (`CADDY_ADMIN_*`), un test de rutare până la adresa publică.
**Criteriu de ieșire:** un client real comandă, plătește, primește o instanță cu adresă
publică, deschide consola și încarcă un fișier. **Stare: neîndeplinită.**
`wordpress` nu poate fi vândut în starea curentă: e marcat deployabil și nu are imagine.

### G3 — Un client poate fi contactat
**Dependență: operator.** `SMTP_URL` (un releu care chiar livrează) și un atașament real
de bilet.
**Criteriu de ieșire:** un bilet deschis ajunge în inboxul unui om și răspunsul se
vede în interfață. **Stare: neîndeplinită** — `SMTP_URL` este gol.

### G4 — Platforma supraviețuiește pierderii unei gazde
**Dependență: operator.** `OFFSITE_TARGET` + `OFFSITE_KEY` + `rclone` instalat, plus
hotărârea despre RAID ( RAID 0 pe volumul de root acceptă pierderea unui disc ca pierdere
a întregii platforme).
**Criteriu de ieșire:** o copie există **în afara gazdei** și un drill de restaurare o
readuce într-o bază goală, cu `sha256sum --check` trecut. **Stare: neîndeplinită** — timerul
rulează, dar copia nu părăsește gazda.

### G5 — Hipervizorul este închis
**Dependență: operator, pe gazda Proxmox.** Parolă `root` rotită, `8006` limitat la
loopback sau la allowlist, `rpcbind` oprit, firewall activ. **Rotirea parolei se face
după firewall, nu înainte.**
**Criteriu de ieșire:** de la exterior nu se mai atinge interfața de administrare a
hipervizorului. **Stare: neîndeplinită.**

### G6 — Defectele de cod din clasa ban și acces sunt închise și reverificate independent
**Dependență: cod, plus un operator independent.**
Constatările Critical/High confirmate în această rundă — tranziția de stare a plății,
perioada prețului, verificarea sumei, escaladarea de privilegii, suspendarea unui
administrator, expunerea exportului de clienți, cookie-ul de sesiune fără `Secure` — sunt
reparate pe ramura `remediation/phase-2-critical-fixes`, cu teste de regresie și **dovada
că testele eșuează fără reparare**.
**Criteriu de ieșire:** suita completă verde **și** un agent diferit de cel care a
implementat confirmă fiecare reparare. **Stare: în curs** — reparatrile sunt implementate,
retestul independent este ultima etapă a acestei faze.

---

## 3. Starea reparărilor din faza 13

| Constatare | Severitate | Reparată | Dovada |
|---|---|---|---|
| `FIN-P1-01` — o comandă anulată/rambursată putea deveni `PAID` și primi infrastructură | Critical | ✅ | `api/src/services/stripe.ts` (garda de stare); dovadă: `_raw/phase2-proof-lead.txt` — fără reparare, comanda moartă **era plătită** |
| `FIN-P2-03` — perioada prețului nu ajungea la comandă (o cotare anuală de 1788 producea o comandă de 149) | Critical | ✅ | `pricing.ts`, `routes/orders.ts`, `routes/catalog.ts`, `web/src/app/Deploy.tsx`; dovadă: fără reparare, comanda anuală era taxată **149** |
| `BE-09` — un eveniment de plată fără sumă trecea drept „sumă corectă" | High | ✅ | `api/src/routes/webhooks.ts`; dovadă: fără reparare, evenimentul **era aplicat** |
| `ADM-P1-01` — un angajat putea acorda 20 din 21 de permisiuni, inclusiv sieși | High | ⏳ agent | `api/src/routes/admin.ts` |
| `ADM-P1-02` — `customers.write` putea suspenda un administrator | High | ⏳ agent | `api/src/routes/admin.ts` |
| `REGR-01` — exportul complet al fiecărui client anulat era expus prin `GET /admin/settings` | High | ⏳ agent | `api/src/routes/admin.ts` |
| `SEC-P1-01` / `SEC-P1-02` — cookie de sesiune fără `Secure`; limitarea per-adresă devenea globală | Critical | ⏳ agent | `api/src/plugins/auth.ts`, `api/src/env.ts` |

**O corecție de fond, verificată de lead:** constatarea `ADM-01` din
`PREVIOUS-FINDINGS-REVALIDATION.md` („rutele de bilete nu verifică permisiunea") este
**invalidă** — verificarea există, în `requireTicketPermission()`
(`api/src/routes/tickets.ts:441`), cu alt nume decât cel căutat. În același fel,
`FIN-P2-01` (numerele de factură cu `count()+1`) este **invalidă**: numerotarea este
atomică (`api/src/services/order-numbers.ts:57-80`). Detaliile sunt în
`_raw/LEAD-VERIFICATIONS.md`. **Două dintre șase verificări ale lead-ului contrazic
rapoartele** — de aceea niciun verdict din acest raport nu se bazează pe o singură
sursă.

---

## 4. Ce se schimbă după G1–G6

Odată închise cele șase porți, platforma are mecanismele dovedite și intră pe un segment
unde **prețul nu este pârghia** — acesta este singurul activ din setul competitiv care
poate susține un preț de listă peste Zentaris și OVINETWORK: **compensarea pe
provisionarea eșuată**, **prețul pe resursă** și **disponibilitatea derivată din realitate,
nu dintr-un steag**. Până atunci, diferențiatorul este o nichelitate tehnică: devine
vizibil abia după ce se repară exact lucrurile care lipsesc.

## 5. Ce **nu** blochează GO-ul

- **Proiectarea interfeței.** Niciuna dintre cele 8 constatări UX blocante nu cere un
  redesign: două sunt corecții de **o linie de CSS**, una este un **import în plus**,
  patru sunt schimbări structurale mici.
- **Contracția de preț.** Prețul afișat, prețul cotat și prețul plătit sunt egale —
  verificat pe codul care rulează în producție.
- **Fișierele de audit și istoricul.** Toate cele 182 de constatări anterioare au primit
  verdict, cu dovezi. Registrul rămâne **unic**: starea remedierii e randată în
  `audit/12-FULL-FINDINGS-REGISTER.md`, nu într-un registru nou.

---

## 6. Limitele acestui verdict

1. **Firefox și WebKit nu sunt instalate** pe mașina de audit: auditul vizual acoperă
   doar Chromium. Limită declarată, nu mascată.
2. **Nu există trafic de producție**: valorile INP/LCP/CLS de la utilizatori reali nu au
   putut fi produse și **nu au fost simulate** ca să pară reale.
3. **Nu a existat test de încărcare autorizat**: plafonul de capacitate al platformei
   **nu este măsurat**. Întrebarea „câte comenzi simultane susține platforma?" rămâne
   deschisă, și este o întrebare de risc comercial.
4. **Un build nu a fost măsurat fără cache**: RTO-ul reconstruirii imaginilor este o
   estimare (5–15 min), nu o măsurătoare.
5. **Verdictul privește starea măsurată pe 2026-10-24.** Se schimbă în ziua în care se
   închid porțile G1–G6, nu înainte.

---

## 7. Semnătura verdictului

**NO-GO pentru lansare comercială, pe 2026-10-24.**
Condiționat de închiderea porților **G1–G6** și de retestul independent al reparărilor
din faza 13. Fiecare poartă are un criteriu de ieșire măsurabil, o dependență numită și
un proprietar: operatorul sau dezvoltarea.
