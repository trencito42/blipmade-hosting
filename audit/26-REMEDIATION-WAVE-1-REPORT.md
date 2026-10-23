# 26 — Runda de remediere, faza 1: siguranța plății și a provisionării

**Data:** 2026-10-23.
**Ramură:** `remediation/phase-1-payment-safety` (din `main`, la `36a75a7`).
**Natura:** implementare pe constatările auditului din runda 1, cu repararea cauzelor rădăcină,
teste de regresie și verificare pe desktop, tabletă și mobil.
**Nicio modificare în producție:** niciun deploy, nicio scriere în baza de date a producției, nicio
comandă, bilet sau instanță creată acolo. Singurul lucru scris a fost în baza de test.

---

## 1. Rezumat

| | |
|---|---|
| Constatări ale auditului din runda 1, toate urmărite | **182** |
| Reparate și verificate înainte de această rundă (runda 2, pe `main`) | 6 |
| **Reparate și verificate în faza 1** | **+23** (total **29**) |
| Implementate, dar nemtestate pe un sistem real | 1 |
| Depind de un lucru din afara codului | 4 |
| Cer aprobarea operatorului | 9 |
| Rămase în backlog, neatinse încă | 139 |

Starea fiecărei constatări, cu cauza, repararea, commitul, testul și rezultatul verificării, este
în `audit/12-FULL-FINDINGS-REGISTER.md`, secțiunea **„Starea remedierii"**. Ea este randată dintr-un
singur fișier (`audit/_tools/remediation-status.json`) printr-un script, deci registrul rămâne
singura listă a constatărilor.

---

## 2. Ce s-a reparat în faza 1

### 2.1 Provisionarea nu mai produce servicii neplătite (`OPS-02`, P0)

**Cauza rădăcină:** `provisionInstance()` nu privea niciodată starea plății comenzii. În producție
există două instanțe `ONLINE` din comenzi `AWAITING_PAYMENT` și `PENDING`.

**Reparare:** poarta este în serviciul de provisionare, nu în ruta care pune în coadă, și se
verifică **din nou în interiorul tranzacției** care scrie identificatorii serverului — o comandă
anulată în timp ce lucra nu poate lăsa un container în urmă. Refuzul se scrie în jurnalul
instanței și în jurnalul de audit, instanța revine în `PENDING`, iar jobul este marcat
neretryabil: o eroare tranzitorie se reîncearcă, o lipsă de plată nu.

### 2.2 Poarta de capacitate nu mai compară megabytes cu gigabytes (`PROV-01`, Critical)

**Cauza rădăcină:** `freeDisk` (MB, cum raportează panoul) era comparat cu `instance.disk` (GB) —
o eroare de factor 1024, care nu bloca niciodată.

**Reparare:** `nodeCapacity()` aduce memoria și discul în MB, `requiredCapacity()` transformă
discul planului în MB, iar comparația se face într-o singură unitate. Refuzul numeste ambele
valori și unitatea lor: *„Node 1 (games-node-01) cannot hold this instance: 10240 MB of free disk,
but the instance needs 20480 MB of disk (20 GB)."*

### 2.3 Provisionarea nereușită nu mai lasă nimic în urmă (`PROV-02`, Critical)

**Cauza rădăcină:** la eșec, containerul rămânea pe nod, alocarea rămâna consumată, comanda
rămânea plătită și nu exista refund.

**Reparare:** o compensare care șterge containerul (doar dacă aparține instanței), eliberează
adresa, marchează comanda pentru refund și îl execută prin `refundPayment()`; dacă furnizorul nu
poate returna banii, comanda este marcată `fulfillmentStatus = FAILED` și refundul este **semnalat**
pentru operator, nu lăsat ca plătit. Compensarea rulează doar la ultima încercare a jobului (o
eroare tranzitorie se reîncearcă și se reia) și este idempotentă: un job livrat din nou nu
rambursează de două ori.

### 2.4 Fereastra serverului dublu (`PROV-13`, High)

**Cauza rădăcină:** containerul era creat, apoi se scria `pterodactylServerId`; o eroare la
scriere lăsa primul container orfan și reluarea crea un al doilea.

**Reparare:** tentativa este înregistrată **înainte** de creare, în jurnalul pasului, iar reluarea o
reutilizează. Dacă înregistrarea eșuează, containerul nou este șters. Un panou inaccesibil este
diferit de un container dispărut, deci o pană temporară nu produce niciodată un al doilea server.

### 2.5 Numerotarea comenzilor și a facturilor este atomică (`PROV-07`, `BE-14`, High)

**Cauza rădăcină:** `count() + 1` contra unei coloane unice → `P2002` → HTTP 500 pentru client.

**Reparare:** un contor (`api/src/services/order-numbers.ts`) ridicat într-o singură instrucțiune,
cu pornire de la cel mai mare număr existent, ca un contor stricat să nu reia un număr în uz.
Același contor servește comenzile, facturile și comenzile de upgrade.

### 2.6 Mașina de stare a banului (`COMM-02`–`COMM-08`, `BE-01`, `BE-03`)

| Defect | Reparare |
|---|---|
| `renew()` marca facturi `PAID` fără încasare (în producție, pentru că Stripe nu e activ) | Factura devine plătită doar la confirmarea încasării; fără furnizor rămâne deschisă, perioada nu se prelungește, abonamentul trece în `PAST_DUE`; există reconciliere cu furnizorul |
| Un `invoice.paid` sosit înainte de comandă era consumat definitiv | Evenimentul este **amânat**, tentativele sunt numărate, reluarea are o limită (12) și există replay |
| O comandă anulată putea fi plătită și onorată | Nu se onorează: banii se returnează sau sunt marcați pentru operator, iar slotul campaniei se eliberează |
| `applyUpgradeOrder()` aplica schimbări neplătite | Verificarea stării plății este **în funcție**, deci toate căile sunt acoperite |
| Prețul stocat al instanței putea fi cel de bază | Prețul este cel al configurației; importul scrie prețul configurației, iar `POST /admin/instances/reconcile-prices` reconciliază și scrie diferența în jurnal |
| `YEARLY` nu era folosit nicăieri, nu exista reinnoire locală | Cotare + plată + perioadă de 12 luni; reinnoirea locală produce o factură deschisă, confirmată de operator cu o referință |
| La anulare serverul era șters imediat, fără export | Serviciul este marcat pentru ștergere după termen (implicit 30 de zile), iar datele clientului sunt exportate înainte de orice ștergere |

### 2.7 Campaniile sunt limitate (`PROMO-02`, `PROMO-03`, `PROMO-06`, `PROMO-07`)

- **Limita per cont putea fi setată?** Nu: coloana exista și era onorată, dar nici API-ul, nici
  formularul nu o atingeau, deci fiecare campanie era nelimitată per cont. Acum se poate **seta,
  schimba și goli**, cu validare pe server (`PATCH /admin/promotions/:id`) și în interfață.
- **Plafonul era aplicat atomic?** Nu: contorul era citit și apoi scris. Rezervarea rulează acum într-o
  tranzacție care blochează rândul campaniei și numără în interiorul ei.
- **O campanie `FIXED` fără plafon putea da comanda cu total 0.** Acum campania `FIXED` trebuie să
  aibă suma, iar serverul garantează că reducerea nu depășește niciodată comanda.
- **Cotatia publică nu verifica limita per cont** — clientul vedea un cod valid, iar comanda era
  respinsă mai târziu. Cotatia primește acum utilizatorul semnat.

### 2.8 Aplicația în container (`OPS-01`, `B-74`) — implementat, nemtestat pe panou

Auditul a găsit un produs vândut al cărui container ținea doar `.npm/` și `bm-test.txt`, cu o
comandă de pornire (`npm run start`) fără nimic de rulat. Un container care răspunde „online", dar
nu conține o aplicație, nu e un produs.

`api/src/services/starter-apps.ts` scrie în container, după instalare și înainte de pornire, un
pachet real (`package.json` cu scriptul `start`) și o aplicație HTTP care răspunde pe calea de
sănătate a produsului. Produsul scrie peste aceste fișiere cu aplicația lui.

**Stare: `IMPLEMENTED, NOT VERIFIED`** — mecanismul e în cod și are test, dar dovada de capăt
(*„containerul pornit raportează online, cu memorie nenulă, iar endpointul aplicației răspunde"*)
necesită un panou real și o decizie de produs despre ce aplicație rulează.

### 2.9 Programarea copiei de backup (`B-09`, partea de cod)

Scriptele de backup existau, dar **nimic nu le rula**: nu exista nici crontab, nici timer (verificat
pe VM 103). Acum există `scripts/systemd/blipmade-backup.{service,timer}` și
`scripts/install-backup-timer.sh`, care le instalează și le activează idempotent.

**Stare: `IMPLEMENTED, NOT VERIFIED`** — instalarea pe gazdă cere root și o deciție de operator
(`OFFSITE_TARGET` + cheia de criptare).

---

## 3. Verificările rulate

| Verificare | Rezultat |
|---|---|
| Suite API (vitest) | **325 / 325 trec**, 32 fișiere (era 269 / 269, 28 fișiere) |
| Suite web (node:test) | **87 / 87 trec** |
| Typecheck API (src) | curat |
| Typecheck API (teste) | curat |
| Typecheck web | curat |
| Build web (`vite build`) | reușit |
| Sweep de browser, 26 rute × 1440 / 834 / 390 px | decalaj maxim al tabelelor **0 px**, overflow **0**, a11y **0/0/0** |
| Erori de rețea în sweep | doar cele 3 fonturi Proxima Nova lipsă (defect preexistent) |

Testele noi: `api/tests/provisioning-safety.test.ts` (13 cazuri), `api/tests/billing-lifecycle.test.ts`
(13 cazuri), `api/tests/promotions.test.ts` (24 cazuri), `api/tests/starter-app.test.ts` (5 cazuri).

Două teste existente au fost corectate, fiindcă afirmau comportamentul defect:
`api/tests/billing.test.ts` scria o factură `PAID` fără furnizor (exact ce `COMM-04` interzice), iar
mock-urile de test ale clientului de panou nu acopereau scrierea fișierelor.

---

## 4. Commit-urile

| Commit | Cuprins |
|---|---|
| `6712dcd` | Provisionare doar pentru comenzi plătite, poarta de capacitate într-o unitate, compensarea la eșec, tentativa unică, numerotarea atomică, aplicația în container |
| `3be3e02` | Mașina de stare a banului: facturi, evenimente amânate, upgrade plătit, prețul configurației, plan anual, retenție și export |
| `793eff4` | Limitele campaniilor: per cont, plafon atomic, campania `FIXED` plafonată, cotatia verifică limita, rutele de reconciliere și de confirmare a încasării |
| `94c1e54` | Programarea copiei de backup și tabelul de stare al fiecărei constatări |

Toate pe `remediation/phase-1-payment-safety`, pushate. `main` nu a fost atins.

---

## 5. Ce rămâne, pe scurt

**În faza 1 (următoarea etapă a ramurii):** `BE-04` (tranzacția unică peste toate mutațiile de
panou), limita reală de CPU a nodului (panoul nu o publică), marcarea „refund dator" (decisie de
operator: `PAID` + `fulfillmentStatus = FAILED`), curățarea instanelor istorice neplătite (decizie de
operator), `PROMO-04`/`PROMO-05` (dezactivarea unei campanii, numărul real de utilizări afișat în
admin), `PROMO-08` (e-mailul campaniei), `PROMO-11` rezolvat.

**Din brief, în fazele următoare:** faza 2 (produsul real, starea reală a containerului, URL-ul
public), faza 3 (backup cu țintă externă, restaurare exersată, health checks, monitorizarea
capacității), faza 4 (workflow-urile pentru client și admin — mare parte deja reparate în runda 2),
faza 5 (densitatea vizuală a paginii principale).

**Dependențe de operator:** toate sunt scrise cu comanda exactă, rezultatul așteptat și ce
deblochează în `audit/25-OPERATOR-DEPENDENCIES.md`. Cele care blochează cel mai mult: cheia
Stripe live (fără ea nu există plată reală), ținta de backup off-host (fără ea RAID 0 rămâne
neacceptabil), decizia despre aplicația produsului vândut (fără ea produsul nu poate fi vândut
onest) și configurația Caddy de pe VM 102 (fără ea instanțele nu au URL public).

---

## 6. Nimic nu s-a atins în producție

Containerele de producție sunt healthy, comenzile (6) și sesiunile (269) au aceleași valori ca la
începutul rundei, iar `main` nu a primit niciun commit din această fază. Reparările trăiesc pe
ramura `remediation/phase-1-payment-safety` și așteaptă un deploy separat, cu aprobare.
