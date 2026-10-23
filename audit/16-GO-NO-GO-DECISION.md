# 16 — Decizia go / no-go

**Data:** 2026-10-23 · **Natura auditului:** read-only, fără modificări de producție.
**Baza deciziei:** cele 13 porți de lansare din `07-release-gates.md`, registrul complet din `12-FULL-FINDINGS-REGISTER.md` (115 constatări, 17 P0) și modelul economic din `09-unit-economics.md`.

---

## 1. Verdictul

> ## ❌ **NO-GO** pentru o lansare comercială cu clienți plătitori.
>
> ## ⚠️ **GO condiționat** pentru un **beta privat, cu plată manuală și un număr limitat de clienți**, cu 13 condiții obligatorii, după remedierea a 9 defecte P0 și a 4 condiții de infrastructură.
>
> ## ✅ **GO** pentru un **waitlist și o comunitate** — activitate care nu produce încasare și nu angajează clienți plătitori.

---

## 2. Motivul într-un rând

Platforma **nu poate lua nicio plată azi** (`STRIPE_SECRET_KEY` gol, `PAYMENTS_ENABLED=false` ⇒ checkoutul răspunde `503 payments_unavailable`). Dar **de aceea nu se poate lansa doar cu cheile**: deschiderea plăților ar expune comercial un produs al cărui container **nu conține aplicația** (rădăcina are doar `.npm/` și două fișiere de test; startup-ul e `npm run start`), cu provisionarea eșuată în 24% din joburi, cu **2 servere orfane din 5**, cu **instanțe provisionate din comenzi neplătite**, fără nicio copie a datelor clienților în afara nodului și fără backup programat.

**Adăugarea cheii Stripe ar transforma o platformă care nu poate lua plată într-una care ia plată pentru un serviciu care nu rulează.** Cheile lipsă sunt necesare, dar nu sunt suficiente.

> **Cele trei lucruri care ar trebui reparate primele**, în această ordine: **aplicația din container** (`OPS-01`), **poarta de plată la provisionare** (`OPS-02`), **poarta de capacitate a discului** (`PROV-01`). Toate trei sunt P0, toate trei sunt ieftine, și toate trei sunt **ascunse de un panou de administrare care arată totul în verde**.

---

## 3. Cele 5 porți RED și ce le declanșează

| Poartă | Constatările care o susțin | De ce e RED |
|---:|---|---|
| **5** — Provisionarea nu e fiabilă | `PROV-01`, `PROV-02`, `PROV-03`, `PROV-13` | Eroare de 1024× în poarta de capacitate; nicio compensație la eșec; 80 eșecuri și 2 servere orfane din 5 |
| **7** — Se vinde un produs fără runtime verificat | `PRICE-01`, `PRICE-02`, `PRICE-04`, `PROV-05`, `OPS-01`, `OPS-02`, `OPS-04` | Doar `discord-bot` e deployable; celelalte 4 au preț public și nu au egg, nu au imagine, nu au startup; **containerul produsului vândut nu conține aplicația**; **se poate obține o instanță dintr-o comandă neplătită**; **nu există URL public**; panoul raportează `state = None` pe toate cele 5 servere |
| **9** — Nu există recuperare în afara hostului | `INF-01`, `INF-02`, `DR-02`, `DR-04`, `DR-05` | RAID 0 pe root; zero copii off-host; backup neprogramat; backup Pterodactyl dezactivat |
| **12** — Funcțiile de bază ale clientului indisponibile | `PROV-04`, `COMM-04`, `COMM-05`, `COMM-07`, `COMM-08`, `PROV-12`, `OPS-03`, `OPS-06` | Checkout 503; e-mail neconfigurat (`mail: file`); **canalul de suport inert** — toate cele 14 bilete au „No replies yet"; nu există plan anual; nu există retenție la anulare |
| **13** — Securitatea infrastructurii critice neverificată | `SEC-01`, `SEC-02`, `SEC-28`, `INF-04`, `INF-05`, `DR-05` | Parolă de `root` deschisă public; Proxmox pe `*:8006`; `rpcbind` pe `0.0.0.0:111`; VM 100/101 neverificate |

Conform regulii brief-ului, **o singură poartă RED blochează lansarea**. Aici sunt cinci.

---

## 4. Cele 13 condiții care inversează verdictul

Toate, nu un subset. Fără una, verdictul rămâne NO-GO.

| # | Condiție | Porți | Constatări închise | Efort estimat |
|---:|---|---|---|---|
| 1 | Cheile Stripe live + `PAYMENTS_ENABLED=true`; **un checkout real cu plată reală**, un webhook real acceptat și unul falsificat refuzat; o alarmă la lipsa secretului de webhook | 2, 3 | `PROV-04` | 2 z |
| 2 | Cheia `SMTP_URL` reală; un e-mail de verificare și unul de resetare **livrate**; notificări livrate către client și către suport | 3, 12 | — | 1 z |
| 3 | `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` setate, backup programat, o copie în afara hostului și **un drill de restaurare pe acea copie**; backup-uri Pterodactyl activate per server | 9, 6 | `INF-02`, `DR-02`, `DR-04` | 4 z |
| 4 | Un container care rulează efectiv, cu aplicația produsului în interior, verificat **de pe nod**; panoul raportează o stare, nu `None`/`offline` | 7, 12 | `PROV-05` | 3 z |
| 5 | Prețul și cardul ascunse pentru cele 4 produse fără egg; `feature_limits` realiste pentru produsul vândut | 7, 12 | `PRICE-01`, `PRICE-02`, `PROV-06` | 1 z |
| 6 | **20 de rulări consecutive** comandă → plată → provisionare → activare, toate reușite; serverele orfane șterse; poarta de capacitate a discului corectată; alarmă la job eșuat | 5 | `PROV-01`, `PROV-02`, `PROV-13` | 5 z |
| 7 | Rambursarea nu mai e înghițită (alarmă + reluare); un job de reconciliere cu Stripe | 3 | `COMM-04`, `COMM-05` | 3 z |
| 8 | Auditul internelor panoului și nodului; **firewall efectiv** pe hipervisor, VM 102 și VM 103; confirmarea că porturile de administrare nu sunt publice; un health-check al punții | 13 | `SEC-01`, `SEC-02`, `SEC-28` | 3 z |
| 9 | Rotirea parolei de panou a clientului, cu o cale de resetare, înainte de orice rotire a `SESSION_SECRET`; reducerea conturilor `root_admin`; retenție pe transportul de e-mail în fișier | 8 | `SEC-11`, `SEC-18`, `SEC-29` | 2 z |
| 10 | **Produsul vândut conține o aplicație care rulează**: rădăcina containerului trebuie să aibă aplicația reală, iar resursele raportate (`state`, `uptime`, memorie) să fie reale | 7, 12 | `OPS-01` | 3–5 z |
| 11 | **Nicio instanță nu se provisionează fără plată**: o comandă `AWAITING_PAYMENT` sau `PENDING` abandonată nu produce nici server, nici alocare | 5, 7 | `OPS-02` | 1 z |
| 12 | **Canalul de suport funcționează**: un bilet nou generează o notificare **livrată** către staff, nu o linie `[mail:file]`; `/status` nu mai raportează „Support — Degraded" din cauza e-mailului | 12 | `OPS-03`, `OPS-06` | 0,5 z |
| 13 | **Instanța are un URL public care răspunde**: `DOMAIN_BASE` și mecanismul de publicare pe Caddy sunt funcționale, `InstanceDomain` nu mai e gol | 7, 12 | `OPS-04` | 3–4 z |

**Total estimat: ~35 zile de lucru efectiv**, excluzând așteptarea după chei, configurațiile Stripe/SMTP și ținta de backup. Efortul este în zile-om de inginerie, nu în costuri furnizor; **nicio sumă în euro nu e estimată aici**, pentru că prețurile furnizorilor nu sunt cunoscute și nu trebuie inventate.

> **Condițiile 10–13 au fost adăugate după verificarea live a drumului de onboarding** (`11-onboarding.md`). Ele nu erau vizibile din cod sau din documentație: un container pornit, un container fără aplicație și o comandă neplătită arată toate trei la fel de „OK" dintr-un panou de administrare. **Condiția 10 e cea mai importantă dintre toate** — până când produsul nu conține o aplicație, tot restul repară o platformă care ia bani pentru ceva inexistent.

---

## 5. De ce verdictul nu poate fi „înmuițat" prin marketing

Auditul a găsit **255 de cote de preț** cu corespuns perfect formulei — **zero inconsistențe** între cele 6 surse de preț. Mecanismul de preț e corect. Problema nu e calculul, e **ce se vinde și ce costă**.

Modelul economic (`09-unit-economics.md`) spune limpede:

| Situație | Rezultat |
|---|---|
| Cardul actual (€1.49–€5.90) | **Nu există break-even.** Contribuția la €1.49 e **−4.05 EUR/client/lună**. La 16 clienți: **−€125.88/lună**. Fiecare client adăugat mărește pierderea. |
| Preț recomandat **€9.99/lună** pentru `discord-bot` la 512 MB/1 vCPU/5 GB | Break-even la **15 clienți** (€149.85/lună contra unui cost fix de €61.00/lună), payback **5.97 luni**, LTV/CAC **3.35** |

**Plafonul de preț al platformei e sub plafonul ei de cost.** Costul de suport singur (€5.00/lună, la ipoteza de 15 min/client/lună) depășește de 3.4× tot venitul unui client la €1.49. Orice campanie de reducere, orice discount de lansare, orice promoție cu cod, înainte de repararea lui `COMM-01`, **crește pierderea și distruge comenzile** — reducerea nu ajunge la Stripe, deci comanda eșuează la `verifyAmount` și clientul ar fi taxat cu prețul neredus.

**Analiza competitivă adaugă încă un prag, calculat de jos în sus.** Prețul de floor al unui nod este `P_floor = C_node / N_safe(config)`, cu `N_safe` = 16 la 1 vCPU, 8 la 2 vCPU, 5 la 4 vCPU. Cu ancora folosită în audit — Contabo VPS 60, 18 vCPU / 96 GB la €49.00/lună, citită 2026-10-23 — rezultă `C_node ≈ €54.44` (`INFERRED`; **operatorul trebuie să înlocuiască această valoare**), deci floor **€3.40** la 1 vCPU și **€6.81** la 2 vCPU.

| Produs | Preț azi | Floor | Rezultat |
|---|---|---|---|
| `discord-bot` | €1.72 | €3.40 (1 vCPU) / €6.81 (2 vCPU) | **Sub floor și sub prețul de piață (€0)** — nu se vinde pe acest hardware |
| `minecraft-paper` (propus de A08) | €4.09 / €4.49 / €5.99 | €3.40 (1 vCPU) / €6.81 (2 vCPU) | **Nivelul 1 trece, nivelul 2 nu** |

**Concluzia de decizie:** prețul nu se negociază înainte de o lansare. **Cardul de preț se schimbă înainte**, iar produsul care se vinde trebuie ales cu un preț peste floor, sau vândut la 1 vCPU. Orice campanie de reducere, înainte de repararea lui `COMM-01`, **crește pierderea și distruge comenzile** — reducerea nu ajunge la Stripe, deci comanda eșuează la `verifyAmount` și clientul ar fi taxat cu prețul neredus.

---

## 6. Cele trei scenarii, cu verdictul fiecăruia

### Scenariul A — Lansare comercială publică, cu clienți plătitori

**Verdict: NO-GO.** Cinci porți RED. Nu se poate deschide public nici cu cele mai bune texte de marketing, pentru că nu există produs care să ruleze, nu există backup și nu există plată funcțională.

### Scenariul B — Beta privat, plată manuală, maximum 10 clienți, preț de fundare

**Verdict: GO condiționat**, după îndeplinirea tuturor celor 9 condiții de la §4, plus trei cerințe specifice:

1. **Cele 4 produse fără egg ies din catalogul public** și din interfața de deploy, cu „Coming soon" înlocuit de „indisponibil pe acest server" — un preț afișat pentru un serviciu inexistent e o promisiune neonorată.
2. **Prețul de fundare e fix și negociat manual**, în jurul lui €9.99, și **se aplică manual**, nu prin codul de promoții — pentru că `COMM-01`/`PROMO-01` fac ca orice reducere să rupă checkoutul.
3. **Operațiunea e manuală și declarată ca atare**: contract de test cu fiecare client, backup manual pe fiecare instanță înainte de orice schimbare, și un canal de suport cu un timp de răspuns anunțat explicit.

Ce **nu** se schimbă în acest scenariu: prețul nu se coboară pentru a atrage volum; volum e exact ce nu trebuie acum, pentru că fiecare client consumă vCPU (tavanul e 16 instanțe) și pentru că niciun client nu poate fi servit cu o platformă ale cărei containere nu rulează.

### Scenariul C — Waitlist și comunitate, fără încasare

**Verdict: GO imediat.** Nu e nevoie de niciuna dintre cele 9 condiții, pentru că nu se iau bani și nu se angajează clienți cu date în producție.

Ce e permis: formular de waitlist, prezentare publică a tehnologiei, canal comunitar, comunicate, colaborări. Ce **nu** e permis: prețuri afișate care nu pot fi plătite, „înscriere" care sugerează o comandă, sau orice afirmație de uptime, de număr de utilizatori sau de recenzii.

---

## 7. Ce ar schimba verdictul în NO-GO → GO

Pe scurt, în ordinea forței:

1. **Repararea celor 4 P0 de produs** — `PROV-01` (poarta de capacitate), `PROV-02` (compensare la eșec), `COMM-01`/`PROMO-01` (reducerea ajunge la Stripe), `COMM-02` (preț stocat = preț de configurație). Acestea fac diferența între „o platformă care are nevoie de reglaje" și „o platformă care ia bani pentru ceva care nu rulează".
2. **Un container care rulează efectiv**, verificat de pe nod. Până când panoul nu raportează o stare, nici restul auditului nu mai contează.
3. **Backup programat + o copie în afara hostului + un drill de restaurare.** Fără asta, orice lansare e o tragere de zaruri cu datele tuturor clienților.
4. **Firewall pe hipervisor, VM 102 și VM 103**, cu rotația parolei de `root`. 17 436 de tentative eșuate în 24 de ore, pe o interfață de administrare deschisă public, e o poartă deschisă către tot hardware-ul.
5. **Cardul de preț la €9.99** pentru produsul vândut. Fără aceasta, scenariul B e LOSS-MAKING prin construcție, chiar dacă tehnic funcționează.

---

## 8. Ce **nu** e un motiv de amânare

Ca să fie limpede ce nu blochează:

- **Nu e o problemă de UX.** Interfața e într-o stare bună: 553 de verificări de browser verzi, structură semantică, navigare cu tastatura, contrast și focus vizibil. Problemele de UX sunt de conținut și de onestitudine (copy care promite reduceri imposibile), nu de construcție.
- **Nu e o problemă de teste.** 240 de teste automate (219 API + 21 web) trec toate. Testele au prins corect comportamentul; ceea ce nu au prins e integrarea cu panoul, cu Stripe și cu backup-ul — deci **mai mult testing nu repară nimic din cele 5 porți RED**.
- **Nu e o problemă de prețuri incorecte calculate.** 255/255 cote corecte. Mecanismul e corect; ce e greșit e ce se vinde, la ce preț.
- **Nu e o problemă de scalare.** Capacitatea sigură de 16 instanțe e suficientă pentru un start real, cu un al doilea nod la 64 GiB.
- **Nu e o problemă de brand sau de nume.** Nicio constatare din acest audit nu privește numele „Blipmade" sau identitatea vizuală.

---

## 9. Semnătura deciziei

| Câmp | Valoare |
|---|---|
| Decizie | **NO-GO** pentru scenariul A; **GO condiționat** pentru scenariul B după §4; **GO** pentru scenariul C |
| Data | 2026-10-23 |
| Emitent | Orchestratorul auditului (sinteză pe baza a 12 rapoarte specializate) |
| Condiții de revizuire | După fiecare remediere P0, sau după îndeplinirea tuturor celor 9 condiții, oricare dintre ele survine prima |
| Ce anulează decizia | Pierderea totală a hostului (`INF-01`, `INF-02`) — caz în care se reevaluează de la zero, nu se repară |

---

> **Limită explicită.** Această decizie se bazează exclusiv pe dovezi strânse read-only în această rundă. Patru afirmații rămân `BLOCKED` (starea live a panoului și a nodului, `DR-05`), iar 19 afirmații de documentație rămân `unverifiable` din același motiv. **Dacă VM 100 sau VM 101 arată un backup funcțional sau o stare a containerelor diferită de ce se deduce din panou, condiția 3 și poarta 7 trebuie reevaluate imediat.** Decizia e făcută pe ce s-a putut verifica; e spusă explicit unde nu s-a putut.
