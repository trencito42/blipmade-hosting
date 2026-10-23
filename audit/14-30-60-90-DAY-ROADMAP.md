# 14 — Roadmap de 30 / 60 / 90 de zile

**Data:** 2026-10-23 · **Baza:** `13-PRIORITIZED-BACKLOG.md` (73 de rânduri) și `16-GO-NO-GO-DECISION.md`.

**Principiul de ordine:** roadmap-ul **nu** e o listă de dorințe într-un calendar. Ordinea e impusă de **dependențe**: nu poți testa o plată înainte să ai o cheie Stripe de test; nu poți promova un produs înainte să ruleze; nu poți face backup înainte să ai o țintă; nu poți roti parola de `root` înainte să ai un firewall, altfel e lockout.

**Ce nu intră în roadmap:** nicio funcție nouă care nu servește unui client. Nicio extindere a portofoliului înainte ca primul produs să fie reproductibil de zero la zero.

---

## 0. Diagrama dependențelor — drumul critic

```text
D-3 acces VM 100/101 ─┐
D-2 țintă off-host ────┼─→ Unda 0 ─→ Unda 3 (backup + firewall) ─┐
D-1 preț €9.99 ───────┤                     │                     │
Cheie Stripe test ─────┤                     ▼                     ▼
Relay SMTP ────────────┘              B-09/B-10           Unda 1 (plăți) ─┐
                                            │                     │         │
                                            ▼                     ▼         ▼
                                      drill restaurare      Unda 2 (produs)─┤
                                                                          ▼
                                                              20 de rulări consecutive
                                                                          │
                                                                          ▼
                                                        Unda 5 (adevărul comercial)
                                                                          │
                                                                          ▼
                                                          BETA (scenariul B)
```

**Cele 4 decizii din `13-PRIORITIZED-BACKLOG.md` §6 (D-1 … D-4) sunt pe drumul critic.** Fără D-2 și D-3, backup-ul și verificarea porții 7 nu pot exista. Fără D-1, modelul economic nu e fezabil.

---

## 1. Zilele 1–30 — „Să poată lua bani în siguranță"

**Ținta: NO-GO → GO pentru scenariul B (beta privat).**

Nu e o lună de features. E o lună în care platforma încetează să piardă date și începe să încaseze corect.

### Săptămâna 1 — Deblocări (D-1 … D-4)

| Acțiune | Cine | Depinde de |
|---|---|---|
| Cheie Stripe de **test**, mediu de test separat de producție | operator | cont Stripe |
| Relay SMTP (Brevo / Resend / similar) | operator | cont |
| Țintă de backup off-host aleasă și configurată | operator | decizie D-2 |
| Cheie read-only de audit pe VM 100 și VM 101; QEMU guest agent pornit pe nod | operator | acces la hipervizor |
| Rularea lui `POST /admin/infrastructure/sync` | operator | acces la panou |
| **Firewall pe hipervisor, VM 102 și VM 103** | operator | — |
| **Rotația parolei de `root`**, `PermitRootLogin prohibit-password` | operator | firewallul de săptămâna asta |

**Observație critică:** fără cheia de audit pe VM 100/101, 19 afirmații rămân `unverifiable` și poarta 7 nu poate fi evaluată complet. **Săptămâna 1 e blocată până când D-3 e rezolvat.**

### Săptămâna 2–3 — Unda 1: siguranța plății

`B-01` poarta de capacitate → `B-02` compensație la eșec → `B-03` reducerea ajunge la Stripe → `B-04` preț stolat = preț de configurație → `B-16` rambursare + reconciliere → `B-17` fereastra de server dublu + numerotare atomică.

Toate în `api/src/services/provisioning.ts`, `api/src/services/stripe.ts`, `api/src/routes/webhooks.ts`, `api/src/routes/orders.ts`, `api/src/services/upgrades.ts`. Un commit logic e posibil dacă se lucrează în ordine.

### Săptămâna 3–4 — Unda 2: produsul vândut

`B-06` catalogul public arată doar produsul real → `B-07` starea reală a containerului → `B-08` `feature_limits` realiste → `B-05` cheile Stripe live.

### Săptămâna 4–5 — Unda 3: date și securitate

`B-09` backup programat + copie off-host + backup Pterodactyl per server → **drill de restaurare** → `B-10` RAID 1 pe `/` → `B-15` TLS intern + HSTS/CSP + escaladare de privilegii.

### Săptămâna 4–5 — Unda 4: adevărul comercial

`B-18` unitatea în contract → `B-19` produs nou ≠ gratuit → `B-20` editare promoții → `B-21` `maxPerUser` + plafon atomic → `B-22` contor unic → `B-23` copy-ul public → `B-42` cardul la €9.99.

### Criteriul de ieșire din zilele 1–30

Toate cele **9 condiții** din `16-GO-NO-GO-DECISION.md` §4 îndeplinite și dovedite, plus:

- [ ] **20 de rulări consecutive** comandă → plată → provisionare → activare, toate reușite
- [ ] 0 servere orfane
- [ ] Un drill de restaurare reușit din copia off-host, cu data și rezultatul scrise
- [ ] Un checkout real cu plată reală reușit; un webhook falsificat refuzat
- [ ] Un container rulează efectiv, cu aplicația produsului în interior, verificat **de pe nod**
- [ ] Catalogul public listează **un singur** produs cu preț
- [ ] Un e-mail de resetare livrat într-un inbox real

**Dacă aceste 7 căsuțe nu sunt bifate la ziua 30, beta-ul se amână.** Nu există o variantă „beta cu plată și cu excepții".

---

## 2. Zilele 31–60 — „Să fie sustenabil"

**Ținta: de la beta la lansare publică limitată, cu cifre măsurabile.**

Beta-ul nu e o etapă de agreare. E etapa în care se **măsoară** ce n-a putut fi măsurat înainte: costul real de suport, timpul real de provisionare, rata reală de eșec, comportamentul real al clienților.

### Zilele 31–45 — Măsurare

| Acțiune | De ce |
|---|---|
| `B-43` instrumentare: evenimente de conversie, cost per client | **Corectare:** există raportare de venit minimală în panoul admin (`api/src/routes/admin.ts:58,73,82,84` — `revenueMonth` și `mrr`), dar e calculată local, **nereconciliată** cu Stripe, și azi dă **€0** pentru că nu există abonamente. Ce lipsește: **tracking de conversie pe evenimente** și **cost per client**. Restul metricilor de growth rămân nemăsurabile azi. |
| Instrumentul de browser reparat (`scripts/ops/browser-customer-panel.mjs` face 12 autentificări; limita e 10 la 15 min) | Instrumentul trebuie reparat **înainte** de a-l folosi ca poartă într-o procedură de lansare |
| Măsurarea suportului: minute pe client pe lună, ca în ipoteza de 15 min | E cea mai influentă ipoteză din modelul economic |
| Fixarea ipotezelor `SERVER_COST` și a ratelor Stripe cu valori reale | Azi sunt placeholder-uri; concluzia de break-even depinde de ele |

### Zilele 31–50 — Unda 5 și P2 de risc

`B-11` retenție la anulare → `B-12` plan anual → `B-24`…`B-31` corectitudinea operațională → `B-32`…`B-37` igiena și documentația → `B-49` antetele de securitate → `B-50` containere întărite → `B-59` adresele publice.

### Zilele 45–60 — Lansare publică limitată

**Condiție:** toate P0 închise, cele 9 condiții dovedite, plus **un preț efectiv aplicat** (D-1) și **o procedură de backup funcțională**.

La lansarea publică:
- Un singur produs, un singur preț, un singur prezentat.
- **Fără reduceri** până când `B-03` e în producție și `B-21` e implementat.
- **Fără plan anual** până când `B-12` e gata.
- **Fără promisiuni** de uptime, de număr de utilizatori, de recenzii sau de suport 24/7.

### Decizia de la ziua 60

Se ia o decizie documentată, bazată pe cifrele reale:

| Dacă | Atunci |
|---|---|
| Costul de suport măsurat ≤ ipoteza (15 min/client/lună) și rata de eșec a provisionării < 2% | **Continuă spre zilele 61–90** cu extindere controlată |
| Costul de suport măsurat > 25 min/client/lună | **Nu se extinde.** Se reduce numărul de produse și se crește prețul, sau se trece la un model self-service |
| Rata de eșec a provisionării > 5% | **Nu se extinde.** Se întârce la Unda 1 și se repară mai bine, înainte de orice altceva |

---

## 3. Zilele 61–90 — „Să crească fără să se rupă"

**Ținta:** de la o platformă care funcționează la o platformă care poate fi susținută și extinsă.

### Zilele 61–75 — Capacitate și recuperare

| Acțiune | De ce |
|---|---|
| **Decizia despre al doilea nod** (`B-37`) | 32 de instanțe sigure dacă nodul are 64 GiB — **nu 128**. În hipervizor e liberă doar **85.51 GiB** RAM. Al treilea nod e imposibil (32 CPU libere, 21.51 GiB RAM). Peste ~30 de clienți e necesar un al doilea server fizic (cost fix 121 ⇒ `n_be` 29). |
| Implementarea nodului al doilea, dacă decizia e DA | 32 de instanțe, cu cost fix suplimentar zero |
| **Al doilea drill de restaurare**, cu un scenariu diferit (pierderea unui singur server de joc, nu a hostului) | `03-disaster-recovery.md` §7.2 |
| Procedura de rotire a secretelor testată end-to-end (`B-66`) | `SESSION_SECRET` e ireversibil dacă nu există o copie |
| `B-59` cele trei adrese publice goale: atribuite sau eliminate | Sunt în DNS și nu servesc nimic |

### Zilele 61–90 — Portofoliul, cu ordine

`08-product-launch-order.md` stabilește ordinea. Principiul: **un produs nou intră în catalog doar după ce precedentul trece de cele 20 de rulări consecutive.** Portofoliul se extinde **serial**, nu în paralel.

Ce e realist în 90 de zile: **un singur produs nou**, dacă primul e reparat și măsurat. Cele 16 egg-uri de pe panou oferă spațiu, dar spațiul de pe panou nu e restricția — **calitatea runtime-ului e**.

### Zilele 61–90 — Creștere

Aplicația lui `10-marketing-strategy.md` și `10-launch-campaigns.md`, cu restricțiile lor:
- Campania cu reducere **rulează numai după** `B-03` + `B-21` + `B-22` în producție.
- **Niciun canal cu volum mare** înainte de măsurarea costului de suport.
- Nicio afirmație de rețea care nu poate fi susținută (vezi `10-positioning.md` §7.2, lista de afirmații interzise azi).

### Zilele 75–90 — Lansare publică generală

Condiție:
- [ ] Costul de suport măsurat și încadrat în modelul, cu prețul ajustat dacă e nevoie
- [ ] Capacitatea aleasă și implementată
- [ ] Două drill-uri de restaurare reușite, cu date diferite
- [ ] `B-36` documentația corectată și verificată din nou
- [ ] Instrumentul de browser reparat și folosit ca poartă în procedura de lansare

---

## 4. Ce se întâmplă în fiecare orizont

| | 1–30 | 31–60 | 61–90 |
|---|---|---|---|
| **Scop** | Să poată lua bani în siguranță | Să fie sustenabil și măsurabil | Să crească fără să se rupă |
| **Stare la final** | Beta privat (scenariul B) | Lansare publică limitată | Lansare publică generală |
| **Cifra care definește faza** | 20 de rulări consecutive reușite | Costul de suport măsurat, în cadrul modelului | Două drill-uri de restaurare + nodul al doilea |
| **Ce NU se face** | Nicio funcție nouă. Nicio reducere. Niciun produs nou. | Niciun produs nou fără 20 de rulări. | Nicio extindere a canalelor înainte de măsurarea costului de suport |
| **Riscul principal al fazei** | Se lansează cu cheile puse, dar cu produsul stricat | Se extinde pe baza cifrelor de model, nu ale celor reale | Se consideră „gata" un backup care nu a fost niciodată restaurat |

---

## 5. Ce anulează roadmap-ul

Trei evenimente, fiecare cu un răspuns predefinit:

| Eveniment | Răspuns |
|---|---|
| **Pierderea totală a hostului** (`INF-01` RAID 0 + `INF-02` fără copii) | Se reevaluează de la zero, nu se repară. `16-GO-NO-GO-DECISION.md` §9 |
| **Costul de suport măsurat peste 25 min/client/lună** | Nu se extinde. Se reduce portofoliul sau se crește prețul. Modelul spune că la €1.49 niciun client nu merită să existe |
| **D-3 nu se rezolvă** (fără acces la VM 100/101) | Poarta 7 rămâne incomplet evaluată; condiția 4 din decizie nu poate fi dovedită; beta-ul nu poate începe |

---

## 6. Ce **nu** este în acest roadmap, și de ce

| Absent | De ce |
|---|---|
| Reordonarea portofoliului (ex. scoaterea produselor de gaming) | Decizie de produs, cu date concrete în `08-product-portfolio.md`; e un rând de backlog, nu o etapă de roadmap |
| Publicitate plătită | Nicio sumă nu poate fi justificată înainte de a exista o metrică de conversie (`B-43`) |
| Plan anual ca lansare separată | `B-12` e în zilele 31–60, ca funcționalitate, nu ca lansare |
| Extinderea la un al doilea server fizic | E necesară peste ~30 de clienți, adică după ziua 90 |
| Replica geografică | E o decizie de cost, care depinde de D-2 și de modelul de venit real |
| Rebranding | Nicio constatare din audit nu privește numele sau identitatea; nu e prioritate |

---

## 7. Cum se măsoară progresul

Nicio fază nu se declară încheiată pe baza unei declarații. Fiecare fază are **două** criterii de ieșire:

1. **Tehnic** — criteriile din `13-PRIORITIZED-BACKLOG.md` §7, verificate prin criteriul „Cum se verifică" al fiecărui rând.
2. **Măsurat** — pentru zilele 31–60 și 61–90: cifrele reale, scrise, cu data și cu sursa. Nu estimări.

**Dacă o fază nu poate fi măsurată, se oprește.** O fază nemăsurabilă e o fază în care nu se știe dacă s-a terminat.
