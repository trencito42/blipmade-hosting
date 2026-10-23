# 00 — Rezumat executiv

**Audit al platformei Blipmade** · 2026-10-23 · read-only, fără modificări de producție
**Corpus:** 44 de rapoarte în `audit/`, **167 de constatări clasificate** (28 P0, 10 Critical, 42 High, 54 Medium, 33 Low/Info), 23 de rânduri de acțiune P0 în backlog, 13 porți de lansare
**Întrebări:** cele 25 din brief-ul master, §16

---

## Verdictul, înainte de orice detaliu

> ### ❌ **NO-GO** pentru o lansare comercială cu clienți plătitori.
> ### ⚠️ **GO condiționat** pentru un beta privat, cu plată manuală, maximum 10 clienți — după 19 condiții.
> ### ✅ **GO** pentru un waitlist și o comunitate: activitate fără încasare.

Platforma **nu poate lua nicio plată** azi (`STRIPE_SECRET_KEY` gol, `PAYMENTS_ENABLED=false`). Dar nici deschiderea plăților nu ar fi suficientă, pentru că **produsul vândut nu conține aplicația**: rădăcina containerului are doar `.npm/` și două fișiere de test, iar startup-ul e `npm run start`. Adăugarea cheii Stripe ar transforma o platformă care nu poate lua plată într-una care ia plată pentru un serviciu care nu rulează.

---

## 1. Is the platform technically ready for real paying customers?

**Nu.** Cinci dintre cele 13 porți de release sunt **RED**, iar regula din brief e că o singură poartă RED blochează lansarea.

| Poartă | Verdict | Constatarea care o decide |
|---|---|---|
| 5 — Provisionarea nu e fiabilă | 🔴 RED | Eroare de 1024× în poarta de capacitate a discului (`provisioning.ts:214`); nicio compensație la eșec — 80 de eșecuri și 2 servere orfane din 5 |
| 7 — Se vinde un produs fără runtime | 🔴 RED | Containerul produsului **nu conține aplicația**; se pot obține instanțe din comenzi **neplătite**; nu există URL public |
| 9 — Nu există recuperare în afara hostului | 🔴 RED | RAID 0 pe root; **zero** copii off-host; backup neprogramat; backup Pterodactyl dezactivat |
| 12 — Funcțiile de bază indisponibile | 🔴 RED | Checkout 503; canal de suport inert; nu există plan anual; nu există retenție la anulare |
| 13 — Securitatea infrastructurii neverificată | 🔴 RED | Parolă de `root` deschisă public (17 436 de tentative/24 h); Proxmox pe `*:8006`; `rpcbind` pe `0.0.0.0:111` |

`VERIFIED` — toate măsurările de mai sus sunt luate direct din sistemul care rulează.

## 2. What exactly is broken or unverified?

**28 de constatări P0** (care se reduc la **23 de rânduri de acțiune** în backlog, fiindcă aceleași defecte se repară împreună), din care cele mai grave:

| # | Defect | Unde | Clasă |
|---|---|---|---|
| 1 | **Produsul vândut nu conține aplicația** — rădăcina containerului: `.npm/`, `bm-test.txt`, `bm-test copy.txt`; fără `package.json` | container live | `VERIFIED` |
| 2 | **Provisionarea nu e condiționată de plată** — instanță `ONLINE` din comanda `BM-00002` / `AWAITING_PAYMENT`; `Subscription` = 0 rânduri | DB + `provisioning.ts:652` | `VERIFIED` |
| 3 | **Canalul de suport e inert** — toate cele 14 bilete au „No replies yet"; `notifyStaff()` scrie în fișier | `tickets.ts:425-439` | `VERIFIED` |
| 4 | **Poarta de capacitate a discului compară MB cu GB** — 1024× prea permisivă; un container care nu-și încape afectează **tot nodul** | `provisioning.ts:214` | `VERIFIED` |
| 5 | **Nicio compensație la provisionare eșuată** — serverul rămâne, alocarea rămâne, comanda rămâne plătită, fără refund | `provisioning.ts:104-115` | `VERIFIED` |
| 6 | **Reducerea de promoție nu ajunge la Stripe** — comanda eșuează la `verifyAmount`; clientul ar fi taxat neredus | `stripe.ts:175` vs `orders.ts:79` | `CODE-INSPECTED` |
| 7 | **Prețul stocat ≠ prețul configurației** — estimarea lunară a clientului e greșită | `admin.ts:912` | `VERIFIED` |
| 8 | **Plățile oprite prin configurare** ⇒ nicio comandă plătibilă ⇒ nicio instanță prin calea de cumpărare | `.env` | `VERIFIED` |
| 9 | **`renew()` fabrică facturi `PAID`** fără încasare, când Stripe nu e live | `billing.ts:248` | `CODE-INSPECTED` |
| 10 | **`invoice.paid` prematur e consumat** ⇒ factura nu se mai creează niciodată | `webhooks.ts:270-280` | `CODE-INSPECTED` |

**Neverificabile:** 19 afirmații de documentație, toate despre **VM 100** (panou) sau **VM 101** (nod) — nu au shell accesibil și QEMU guest agent nu rulează. Plus 4 afirmații `BLOCKED` despre starea live a panoului și a nodului.

**De blocat:** accesul de audit la VM 100 și VM 101 (cheie read-only + pornirea QEMU guest agent). Până atunci, poarta 7 nu poate fi evaluată complet.

## 3. What is genuinely working?

Nu totul e stric. Ceea ce e dovedit funcționează:

- **255/255 de cote de preț au corespuns formulei** — 0 inconsistențe între cele 6 surse de preț. Mecanismul de preț e corect.
- **240 de teste automate trec** (219 API + 21 web) — inclusiv idempotența webhook-ului și garda de reinstalare.
- **553 de verificări de browser verzi** pe 120 de combinații rută × lățime. Defectul de tăiere pe telefon **nu s-a recurs**.
- **Izolarea între clienți e GREEN** — un client nu poate accesa resursele altuia.
- **Paritatea preț–ban** e corectă: server-side, cu sume în unități minori.
- **Structura semantică și navigarea cu tastatura** sunt corecte.
- **`AuditLog` e deja un registru complet de pâlnie** — `auth.register` (11), `order.created` (13), `order.paid` (8), `auth.login` (310). Funnelul se măsoară **azi, cu zero cod nou**.
- **Nicio urmă de compromis pe hipervizor** — cele 93 de autentificări reușite provin din trei adrese **românești** (`82.77.97.125` RO-RESIDENTIAL — probabil operatorul; `86.125.49.245`, `86.125.26.198` RO-RCS-RDS). Fără conturi noi, fără unități systemd necunoscute, fără ascultătoare ascunse.

## 4. Which architectural decisions are problematic?

Cinci, în ordinea impactului:

1. **Produsul vândut e definit în DB, dar nu are runtime.** Tabelele `Node` și `Egg` sunt **goale** — `POST /admin/infrastructure/sync` nu a fost rulat niciodată. `discord-bot` e singurul produs cu `eggId`, dar nici el nu are o aplicație. **Platforma are un catalog, nu un portofoliu.**
2. **Un model de preț care nu include costul.** Cardul e **liniar în exact resursele care se consumă**, deci maximizează vCPU-ul — dar vCPU-ul e resursa rară (20 pe nod), iar RAM-ul e abundent (240 de instanțe ar încăpea). Mixul optim e „memorie mare, un singur vCPU", exact inversul instinctului de „vânză puternică".
3. **Prețul stocat și prețul configurației sunt două lucruri diferite**, în două locuri diferite, fără reconciliere.
4. **O singură alocare per server** (`provisioning.ts:482-484`) — face imposibilă provisionarea produselor care au nevoie de mai multe porturi (Rust, TeamSpeak3).
5. **Zero mecanism de invalidare a cache-ului** și zero cache — azi e inocent, dar nu există nici măcar o premisă pentru unul.

## 5. What are the ten most dangerous issues?

| # | Problema | De ce e periculoasă | ID |
|---|---|---|---|
| 1 | Containerul produsului nu conține aplicația | Se iau bani pentru un serviciu inexistent | `OPS-01` |
| 2 | Se pot obține instanțe din comenzi neplătite | Pierdere directă de venit + cost de provisionare | `OPS-02` |
| 3 | RAID 0 pe root + zero copii off-host | Pierderea unui SSD distruge ireversibil datele **tuturor** clienților | `INF-01`, `INF-02` |
| 4 | Poarta de capacitate a discului compară MB cu GB | Un container prea mare **afectează tot nodul**, nu doar clientul | `PROV-01` |
| 5 | Parolă de `root` deschisă public, Proxmox pe `*:8006` | Controlul întregii infrastructuri, cu 17 436 de tentative/24 h | `SEC-01`, `SEC-02` |
| 6 | Nicio compensație la provisionare eșuată | 80 de eșecuri și 2 servere orfane **plătite** din 5 | `PROV-02` |
| 7 | Reducerea nu ajunge la Stripe | Orice campanie rupe checkout-ul și taxează neredus | `COMM-01` |
| 8 | Canalul de suport inert | Nimeni nu primește biletele; clienții nu au niciun canal | `OPS-03` |
| 9 | `renew()` fabrică facturi `PAID` + `invoice.paid` prematur consumat | Documente de facturare false sau pierdute definitiv | `COMM-04`, `COMM-05` |
| 10 | `applyUpgradeOrder()` nu verifică plata | Latent azi; bombă cu ceas la orice apel nou | `COMM-03` |

## 6. What are the ten biggest UX/UI weaknesses?

Din `06-design-improvement-backlog.md` (28 de constatări, S1–S4):

| # | Rută | Problemă | Efort |
|---|---|---|---|
| UX-01 | 9 rute, 22 de tabele | `DataTable` strică modelul de tabel: `<tbody class="grid">` ⇒ antetul nu se aliniază cu corpul (decalaj 105–562 px) | M |
| UX-02 | `/app/instances/:id` | Antetul spune „No public URL yet", dar adresa `10.77.0.11:30001` există și e chiar în tabul „Network" | S |
| UX-03 | `/app/instances/:id` | „Online" (pastilă) și „Container: offline" (metrici) pe **același ecran** | S |
| UX-04 | `/admin/services` | Staff-ul nu poate inspecta o instanță: nicio rută, niciun link; adresa de client răspunde 404 | L |
| UX-05 | tot ce trece prin plată | `503 payments_unavailable` blochează checkout, comandă, subscripție și domeniu | — |
| UX-06 | `/`, `/apps` | Catalogul e cerut de **5 ori** pe pagina de pornire | S |
| UX-07 | `/apps` | Starea de încărcare arată ca un catalog gol (8 carduri goale) | S |
| UX-08 | 13 rute de staff | Butonul „Retry" al stării de acces interzis te duce în panoul **client** | S |
| UX-09 | 20 de pagini, 63 de elemente | `--ink-3` (`#7b827b`) nu trece 4.5:1 pe `--s2` (4.31), `--s3` (3.80), `--acc-bg` (3.92) | **o linie de CSS** |
| UX-10 | dialog + panou staff | Alb pe `--bad` = 2.78:1; `--ink` pe `--bad` = 2.55:1 | **o linie de CSS** |

**Observația importantă:** UX-01, UX-02 și UX-03 nu sunt doar probleme de aspect. UX-02 și UX-03 sunt **interfața mințind** — spun „fără URL public" și „online" în timp ce realitatea e „adresa există, containerul e oprit". **Astea sunt defecte de onestitudine, nu de design.**

## 7. Which features are missing versus simply unfinished?

**`NOT-IMPLEMENTED` — nu există în cod:**
- Plan anual (`YEARLY` nu e folosit nicăieri) · mecanism de reînnoire local
- Politică de retenție la anulare și export înainte de ștergere
- `PATCH`/`DELETE` pe promoții — o campanie greșită **nu poate fi oprită din interfață**
- `maxPerUser` setabil (există în DB, nu e expus, e cod mort)
- Mecanism de captare a lead-urilor (niciun model `Lead`/`Waitlist` în cele 31 de modele Prisma)
- `sitemap.xml`, `canonical`, JSON-LD, Open Graph — HTML servit: **850 de octeți**, doar `<div id="root">`
- Provisionare multi-alocare (Rust, TeamSpeak3)
- Sitemap pentru produse inexistente — și produsele **inexistente au preț activ public** (4 din 5)

**De început, dar neimplementate:**
- `Cookie Secure` în producție (`env.cookieSecure` e cod mort)
- Limită de rată pe rutele mutante · limită de login per cont
- Validarea segmentelor de cale interpolate în URL-urile panoului
- TLS intern între containere
- HSTS / CSP / `X-Frame-Options`

## 8. Which currently advertised features are misleading or simulated?

| Afirmația publică | Realitatea | ID |
|---|---|---|
| „50% off your first month" | Reducerea nu ajunge la Stripe; comanda eșuează la plată | `PROMO-10`, `PROMO-11` |
| „code per account" | `maxPerUser` nu poate fi setat | `PROMO-02` |
| 4 produse cu preț activ public | Niciunul nu are egg, imagine sau startup | `PRICE-02` |
| „Coming soon" pe 4 produse | Promite ceva ce **poate** fi livrat; produsul unic deployable nu poate | `PRICE-04` |
| „Online" (pastilă) | Containerul e oprit; resursele raportate sunt 0 | `OPS-01`, `UX-03` |
| „No public URL yet" | Adresa `10.77.0.11:30001` există și e în tabul „Network" | `UX-02` |
| „CURRENT PERIOD ENDS —" | Câmpul există, valoarea e `null` | `UX-14` |
| Catalogul cu prețuri pe pagina de pornire | Platforma **nu poate lua nicio plată** | `PROV-04`, `MKT-05` |

## 9. What is the verified state of the four public IP addresses?

`VERIFIED`, măsurat cu sondaje TCP și RDAP:

| Adresă | Rol real | Stare |
|---|---|---|
| `193.34.214.20` | Serverul (hipervizorul), `n7030e1.mevnode.com` | **Singura care servește ceva.** SSH, Proxmox pe 8006, rpcbind pe 111 — toate deschise public |
| `193.34.214.86` | Alias al lui `panel.blipmade.com` → panoul Pterodactyl (VM 100) | Răspunde |
| `193.34.214.87` | Alias | **Nu servește nimic** |
| `193.34.214.143` | Alias | **Nu servește nimic** |

`blipmade.com` și `www.blipmade.com` merg prin **Cloudflare** → Caddy (VM 102) → containerul web (VM 103).

**O precizare care a fost corectată:** sondajele din rețeaua internă dau false negative pe DNAT — kernel-ul lui VM 103 trimite RST. Verificarea corectă e pe eth0 sau din exterior. **Nu e un defect de rețea.**

## 10. How much hardware capacity can actually be sold safely?

**16 instanțe sigure pe nod**, tavan 20. **Limita e vCPU, nu RAM** — RAM-ul ar permite 240.

| Resursă | Consum la 16 instanțe | Disponibil | Stare |
|---|---|---|---|
| RAM | 32 GiB | 120 GiB | ✅ |
| Disc | 160 GiB | 800 GiB | ✅ |
| **vCPU** | **16** | **20** | ✅ — **aceasta e limita** |

- **Al doilea nod: 32 instanțe sigure**, cu **cost fix suplimentar zero** — dar nodul trebuie să fie de **64 GiB**, nu 128. În hipervizor e liberă doar **85.51 GiB** RAM.
- **Al treilea nod e imposibil** (32 CPU libere, 21.51 GiB RAM).
- Peste ~30 de clienți e necesar un al doilea server fizic.

**Aici apare paradoxul comercial:** la specificația de piață (2 vCPU/server), nodul ține doar **8 servere plătitori**. **Oferta e necompetitivă la specificația pieței, cu excepția vânzării la 1 vCPU.**

## 11. Which products should launch first?

**Unul singur, la 1 vCPU, cu preț peste pragul de contribuție.**

`08-product-launch-order.md` propune **faza 1 = `minecraft-paper`** (egg #5, `yolks:java_25`): **€4.09** la 4 GB / 1 vCPU / 25 GB — peste pragul de contribuție de €5.67? **Nu.** La €4.09 e sub prag. Variantele **€4.49** (4 GB / 2 vCPU) și **€5.99** (6 GB / 2 vCPU) trec de €3.40 (1 vCPU) și €6.81 (2 vCPU) — prima trece, a doua nu.

**Decizia orchestratorului, după reconcilierea celor două modele de cost:**

| Produs | Preț | Pragul de contribuție (€5.67) | Pragul nodului (1 vCPU: €3.40 / 2 vCPU: €6.81) | Verdict |
|---|---|---|---|---|
| `discord-bot` | €1.72 | ❌ | ❌ | **Nu se vinde nici experimental pe acest hardware** |
| `minecraft-paper` 4 GB / 1 vCPU | €4.09 | ❌ | ✅ | **Nu la acest preț** |
| `minecraft-paper` 4 GB / 2 vCPU | €4.49 | ❌ | ❌ | **Nu** |
| `minecraft-paper` 6 GB / 2 vCPU | €5.99 | ✅ | ❌ | **Nu** |
| **`discord-bot` re-speccat, sau `minecraft-paper` la 1 vCPU** | **≥ €6.81** | ✅ | ✅ | **Candidații reali** |

**Recomandarea fermă: primul produs vândut trebuie să coste minimum €6.81/lună** (1 vCPU) sau minimum €7.82 (2 vCPU, prag de payback 12 luni). `discord-bot` rămâne **singurul produs deployable**, deci **singurul care poate fi folosit pentru beta și pentru învățare** — dar la un preț de fundare negociat manual, nu la €1.72.

## 12. Which products should NOT be offered on the current server?

**4 din 5 din catalogul actual**, cu preț activ public: `wordpress`, `code-server`, `uptime-kuma`, `postgresql` — niciunul nu are egg, imagine sau startup. `NOT-IMPLEMENTED`.

**Niciodată pe acest hardware:** WordPress, Code Server, Uptime Kuma, PostgreSQL, Node.js/Python „generic", Mumble, Forge, CS:GO, TF2, Insurgency, Ark, GMod, Bungeecord, Sponge. Din 21 de candidați: **0 `LAUNCH-NOW`, 7 `LAUNCH-SOON`, 4 `CONDITIONAL`, 10 `NEVER`.**

Motivul tehnic: produsele cu **stare** (baze de date, CMS, monitoring) au nevoie de **backup**, și backup nu există.

## 13. What exact starting prices do you recommend and why?

**Există două răspunsuri corecte în corpus, pentru două modele de cost diferite, și trebuie spus care e care.**

| | Produs | Preț | Model | Prag |
|---|---|---|---|---|
| **A** | produsul vândut, la configurația implicită 512 MB / 1 vCPU / 5 GB | **€9.99/lună** | **model de cost**: contribuție + CAC + absorbție (`09-unit-economics.md`) | peste pragul de contribuție (€5.67), de amortizare CAC (€7.82) și de absorbție (€9.60) |
| **B** | `minecraft-paper`, primul produs propus de `08-product-launch-order.md` | **€4.09** (4 GB / 1 vCPU / 25 GB) | **model de nod**: `P_floor = C_node / N_safe` (`08-product-launch-order.md` §7) | peste pragul de acoperire la 1 vCPU (€3.40), dar **sub** pragul de contribuție (€5.67) |

**Răspunsul meu, după reconcilierea celor două modele** (reconcilierea e în `12-FULL-FINDINGS-REGISTER.md` §7e): **un singur preț, €9.99, la configurația implicită**, pentru că e singurul care trece **toate** pragurile. Dar cu trei rezerve, obligatorii:

1. **€9.99 e un preț de *acoperire a costului*, nu un preț de piață.** E de ~2× peste intrarea documentată pe piață (€3.99–€4.74 la 4 GB / 2 vCPU). La acest preț, beta-ul e **pe minus prin construcție**: cu 10 clienți, contribuția e €41.90 contra unui cost fix de €61.00, adică **−€19.10/lună**.
2. **Piața are un concurent cu tier gratuit** (Lunafy: primul server la €0/lună, server suplimentar la €1). La €9.99, prețul e peste pragul de cost **și** peste prețul de intrare — deci **nu** îl vindem concurenței gratuite, ci îl vindem unui segment care plătește pentru backup și protecție.
3. **`C_node` e o ancoră de piață (€54.44), nu o factură.** **Operatorul trebuie să o înlocuiască**; fiecare prag se deplasează liniar cu ea.

**Pragurile, la prețul de €9.99:** contribuție ≥ 0 la **€5.67** · payback 12 luni la **€7.82** · absorbția costului fix la 16 clienți la **€9.60** · payback 6 luni la **€9.97**. **€9.99 trece toate patru.**

**CAC maxim acceptabil: €50.28** la payback 12 luni, **€25.14** la 6 luni; efectiv **~€25–27** cu regula LTV/CAC ≥ 3. LTV @5% churn = **€83.81**, LTV/CAC **3.35**. Payback **5.97 luni**.

**De ce nu un preț mai mic:** cardul actual (€1.49–€5.90) e sub pragul de €5.67 — **la €1.49 contribuția e −€4.05 EUR/client/lună**, la 16 clienți rezultatul e **−€125.88/lună**, iar CAC maxim e **0.00**. **Fiecare client adăugat mărește pierderea.**

**De ce nu un preț mai mare:** e peste ce acceptă piața pentru o ofertă fără DDoS și fără backup. **€4.49 e nivelul de intrare al Zentaris**, cu €0.50 peste OVI și €0.25 sub Torchbyte la aceeași specificație — deci prețul e **corect calibrat**; ce lipsește e serviciul, nu prețul.

## 14. What is the realistic monthly break-even?

**Două răspunsuri, pentru două modele de cost diferite:**

| Model | Break-even | La ce preț | Sursă |
|---|---|---|---|
| **Contribuție** (recomandat) | **15 clienți** × €9.99 = **€149.85/lună** contra unui cost fix de **€61.00/lună** | €9.99 | `09-unit-economics.md` |
| **Acoperire de nod** | **14 instanțe** | €4.09 | `08-product-launch-order.md` §7 |

`contribution = 0.97 × 9.99 − 5.50 = 4.1903` · `n_be = ceil(61.00 / 4.1903) = 15` · la 16 clienți: **+€6.04/lună**.

**Răspunsul pentru o decizie: 15 clienți la €9.99.** Al doilea răspuns (14) folosește un model care nu include costul de suport per client, deci e mai optimist.

**La cardul actual: nu există break-even.** La €1.49, pierdere de **€125.88/lună** la 16 clienți.

**Ipoteze, cu sensibilitatea lor:** `SERVER_COST` 60.00 (**placeholder, input al operatorului** — tabel 30/45/60/75/90/120 furnizat); suport 15 min/client/lună la 20.00 EUR/h (**cea mai influentă ipoteză** — sensibilitate 5–30 min); Stripe 3% + 0.25 (**placeholder** — nu există Stripe); CAC 25; churn 5%. **La TVA de 19% aplicat sus, netul scade și break-even-ul trece la 24 de clienți** — TVA e `BLOCKED`, nu evaluată.

## 15. How many customers can fit before expansion becomes necessary?

| | Clienți | Notă |
|---|---|---|
| Azi, 1 nod | **16** (tavan 20) | Limitat de vCPU |
| Cu al doilea nod de 64 GiB | **32** | Cost fix suplimentar zero |
| Al treilea nod | **Imposibil** | 32 CPU libere, 21.51 GiB RAM |
| Peste ~30 de clienți | Al doilea **server fizic** | Cost fix 121 ⇒ `n_be` 29 |

**Atenție:** „expansion" înseamnă **un nod, nu o mașină**. Pe hardware-ul actual, 16 clienți plătitori la €9.99 înseamnă **€159.84/lună** de venit pe nod — peste pragul de contribuție și peste costul fix, dar cu un plafon de venit la lista proprie de prețuri de **€23.84–€36.48/lună**, mult sub cost.

## 16. What are the most promising customer-acquisition channels?

**Recomandarea, în ordine:**

1. **Discord** — singurul canal sigur **înainte** de poartă, pentru că nu necesită captare de lead-uri în produs și nu implică e-mail. (Există însă un risc de concentrare și o dependență de o platformă terță — `08-product-portfolio.md` §8.)
2. **Comunitate și conținut tehnic** — demonstrarea rezolvării problemei reale (provisionare fiabilă, preț transparent).
3. **SEO** — **numai după** ce există conținut servit. Azi `sitemap.xml` dă 404, HTML-ul e 850 de octeți, `/apps` n-are `<h1>`. **SEO-ul e imposibil în starea curentă**; e un proiect de o lună, nu o tactică.
4. **Comunități de nișă** (Discord-uri de developeri, gamedev, self-hosting).
5. **Parteneriate / colaborări** cu proiecte mici.

**Ce NU se face acum:** reclamă plătită, SEO, parteneriate cu volum mare. Niciuna nu se poate măsura, pentru că nu există tracking de conversie pe evenimente și nu există raportare de cost per client.

## 17. What promotions can we afford?

**În momentul de față: niciuna.**

Motivul nu e bugetul, e o defecțiune: **reducerea nu ajunge la Stripe** (`COMM-01`/`PROMO-01`). Orice cod de promoție face comanda să eșueze la `verifyAmount` și, dacă ar trece, clientul ar fi taxat cu prețul **neredus**.

După reparare, **`09-pricing-recommendations.md` §5** arată ce costă o reducere la volumurile curente, iar **`09-unit-economics.md`** plasează pragurile. **Un discount de 50% la €9.99 consumă 4.995 EUR de contribuție pe client** — e un preț de fondare, nu o campanie de volum.

În plus: **nicio campanie cu cod nu trebuie rulată** cât timp `maxPerUser` nu e setabil, plafonul nu e atomic și o promoție nu poate fi oprită din interfață.

## 18. What should the homepage and checkout change to increase trust and conversion?

**Homepage:**
- **Scoaterea prețurilor afișate** pentru produsele care nu pot fi cumpărate (4 din 5 azi). Un preț afișat pentru un serviciu inexistent e o promisiune neonorată.
- **Ascunderea reducerii de 50%** până la repararea lui `COMM-01`.
- **Zero conținut servit** — 850 de octeți, doar `<div id="root">`. Pentru SEO și pentru încredere, e nevoie de conținut real pe server: ce produse există, cum funcționează, ce garanții există, cine e operatorul.
- **Identitatea operatorului și termenii** vizibili — lipsesc, și sunt cerință legală, nu preferință.

**Checkout:**
- **Mesajul de 503 trebuie să fie cel pe care îl vede clientul.** Acum `Deploy.tsx` aruncă excepția, iar textul prietenos „deschide un bilet de suport" nu apare niciodată.
- **Unitatea prețului**, afișată explicit.
- **Prețul afișat trebuie să fie prețul încasat** — azi nu e (`COMM-01`).

## 19. What does the admin panel still need to operate the business effectively?

1. **O rută de inspecție a instanțelor pentru staff** — azi `/admin/services` nu poate duce la o instanță, iar adresa de client răspunde 404 (`UX-04`). E un defect de operare, nu de design.
2. **Sincronizarea infrastructurii** — `POST /admin/infrastructure/sync` nu a fost rulat; tabelele `Node` și `Egg` sunt goale (`PROV-11`).
3. **Un registru de joburi de provisionare** — joburile `failed` sunt șterse de `pruneQueue()` (`PROV-03`).
4. **Alerte** — job eșuat, rambursare înghițită, secret lipsă, e-mail neconfigurat.
5. **Editarea și oprirea promoțiilor** (`COMM-11`).
6. **Un contor corect de redemption** (`COMM-12`).
7. **Reconciliere cu Stripe** — `revenueMonth` și `mrr` există (`admin.ts:58,73,82,84`) dar sunt locale și nereconciliate, azi €0.
8. **Monitorizare și backup programat** cu un panou de stare real.

## 20. What must be completed before private beta?

**Cele 19 condiții din `16-GO-NO-GO-DECISION.md` §4.** Cele care decid:

- [ ] **Produsul vândut conține o aplicație care rulează** (`OPS-01`) — containerul pornește, resursele raportate sunt reale
- [ ] **Nicio instanță fără plată** (`OPS-02`)
- [ ] **Poarta de capacitate corectată** (`PROV-01`) și **compensație la eșec** (`PROV-02`)
- [ ] **Backup programat + o copie off-host + un drill de restaurare reușit** (`INF-02`, `DR-02`, `DR-04`)
- [ ] **Un container care rulează efectiv, verificat de pe nod** — panoul raportează o stare, nu `None`
- [ ] **Firewall pe hipervisor, VM 102 și VM 103**, cu rotația parolei de `root` (`SEC-01`, `SEC-02`, `SEC-28`)
- [ ] **Cheile Stripe live + un checkout real cu plată reală** + webhook acceptat și unul falsificat refuzat
- [ ] **Cheia SMTP reală + e-mail de verificare și de resetare livrate** + notificări de bilet livrate (`OPS-03`)
- [ ] **Prețul și cardul ascunse pentru cele 4 produse fără egg** (`PRICE-01`, `PRICE-02`)
- [ ] **20 de rulări consecutive** comandă → plată → provisionare → activare, toate reușite, 0 servere orfane

## 21. What must be completed before public launch?

Tot ce e la punctul 20, plus:

- [ ] **Reducerea ajunge la Stripe** (`COMM-01`) — altfel nicio campanie nu poate rula
- [ ] **Prețul stolat = prețul configurației** (`COMM-02`)
- [ ] **`renew()` nu mai fabrică facturi `PAID`** + reconciliere cu Stripe (`COMM-04`, `COMM-05`)
- [ ] **Plan anual** (`COMM-07`) și **retenție la anulare** (`COMM-08`) — sau o decizie explicită de a nu le vinde
- [ ] **Instanța are un URL public** (`OPS-04`)
- [ ] **O copie off-host verificată prin al doilea drill** (`DR-05`)
- [ ] **Instrumentul de browser reparat** — face 12 autentificări, limita e 10 la 15 min; trebuie reparat **înainte** de a-l folosi ca poartă în procedura de lansare
- [ ] **Documentația corectată** — 13 derivații, dintre care 4 critice
- [ ] **Identitatea operatorului, termenii și condițiile, dreptul de retragere** publicate și cele 29 de elemente de conformitate verificate cu un profesionist
- [ ] **Copy-ul public verificat** — nicio afirmație care nu poate fi susținută

## 22. What can wait until after launch?

- Limitele de rată pe rutele mutante, limita de login per cont, validarea segmentelor de cale
- HSTS / CSP / `X-Frame-Options` — **cu excepția** situației în care se decide expunerea originii
- Containere ca non-root, `read_only`, `cap_drop` complet
- `scrypt` la parametrii OWASP, generator de secrete cu CSPRNG
- `env.cookieSecure` fie devine real, fie dispare
- `/api/status` să nu mai expună starea configurației
- Timeout de inactivitate pe sesiuni; comparații de token în timp constant
- Extragerea de adrese publice goale (`NET-01`)
- Extinderea portofoliului — **numai după** ce precedentul trece de 20 de rulări consecutive
- Plan anual ca **lansare separată** — e o funcționalitate, nu o etapă
- Actualizarea Caddy-ului la o versiune întreținută
- Documentația: 9 din cele 13 derivații (cele 4 critice rămân P1)

## 23. What is the estimated cost of completing the critical work?

**~44 de zile-om de lucru efectiv**, în zilele 1–30 (Unda 0 → Unda 5 din `14-30-60-90-DAY-ROADMAP.md`): ~24 de zile de remediere de cod, ~20 de zile de infrastructură și operațiuni.

**În euro, formula e directă dar rata nu se știe:** `cost_lucru = 44 × rata_zi_om`, cu `rata_zi_om` marcat **`OPERATOR-INPUT`**. **Nicio rată nu e presupusă aici** — pentru că prețurile furnizorilor nu sunt cunoscute și nu trebuie inventate. Ce se poate afirma azi, fără ipoteze: **cea mai mare parte din efort e în zile-om de inginerie, nu în costuri cu furnizori**.

Costurile externe care **trebuie** stabilite de operator, și care nu apar în cele 44 de zile: cheile Stripe (taxa de tranzacție e deja parametrizată ca 3% + 0.25 în model), relay SMTP, ținta de backup, și `C_node` — noua valoare reală a facturii de server, în locul ancorei de piață de €54.44.

## 24. What are the biggest commercial risks in the first six months?

**Registrul complet, cu 15 riscuri, declanșator observabil și reacție definită pentru fiecare, e în `14-30-60-90-DAY-ROADMAP.md` §4b.** Topul:

1. **Se iau bani pentru un serviciu care nu rulează.** Cel mai mare risc, și e deja real — nu ipotetic.
2. **Pierderea datelor unui client, fără nicio copie.** RAID 0, zero backup. Un singur incident distruge reputația și, probabil, relația comercială.
3. **Clientul e taxat cu prețul neredus** — `COMM-01`. Reducerea nu ajunge la Stripe.
4. **Prețul sub cost.** Fiecare client adăugat mărește pierderea. Cel mai probabil e „câștig" prin reducere, ca răspuns la o concurență mai ieftină.
5. **Canalul de suport inert + preț de sub prag** = cost de suport pe client mai mare decât venitul. Se pierde fiecare client.
6. **Beta-ul e pe minus prin construcție** (−€19.10/lună la 10 clienți). Nu e o catastrofă, dar trebuie bugetat ca un cost, nu prezentat ca o venit.
7. **Dependența de Discord** ca canal unic de captare înainte de poartă.
8. **Zero încasare, zero metrici.** `AuditLog` are evenimentele, dar cele 8 `order.paid` sunt sintetice, iar conversia reală e 0. Fără tracking de conversie și fără cost per client, nu se poate știi dacă o campanie funcționează.
9. **Dependența de o singură mașină fizică** — și de un singur operator.
10. **Risc de conformitate**: 29 de elemente neconfirmate, inclusiv TVA, drept de retragere și baza legală pentru e-mail.

## 25. Would you personally approve this platform for a controlled commercial launch based on the available evidence?

**Nu, nu astăzi. Și nu prin adăugarea cheilor.**

Aș semna un **beta privat, cu plată manuală, maximum 10 clienți**, în trei condiții:

**Condiția 1 — cele 19 de la `16-GO-NO-GO-DECISION.md` §4, toate îndeplinite și dovedite.** Cele trei care contează cel mai mult: produsul conține o aplicație care rulează, provisionarea e condiționată de plată, și backup-ul e dovedit printr-un drill de restaurare.

**Condiția 2 — prețul.** Niciun client nu intră la €1.49. Prețul de fundare e negociat manual, în jurul lui **€9.99**, și se aplică **manual**, nu prin codul de promoții.

**Condiția 3 — beta-ul e declarat ca un cost, nu ca un business.** La 10 clienți și €9.99, rezultatul e **−€19.10/lună** (contribuție €41.90 contra unui cost fix de €61.00). **Beta-ul nu se amortizează, el demonstrează** — și trebuie bugetat ca atare, cu un plafon explicit. Prezentat ca „business care merge", ar fi o minciună; prezentat ca un experiment cu un scop, e corect.

**Ce aș semna fără ezitare, azi:** waitlistul și comunitatea. Nu costă nimic, nu angajează clienți și nu pune date în producție.

**Ce nu aș semna în niciun caz:** deschiderea plăților cu `STRIPE_SECRET_KEY` reală înainte de condiția 1. Ar transforma o platformă (onestă) care nu ia bani într-una care ia bani pentru un container gol.

**Observația finală care contează cel mai mult:** toate cele trei defecte P0 de produs — containerul fără aplicație, instanța fără plată, canalul de suport inert — **sunt ascunse de un panou de administrare care arată totul în verde**. `Instance.status = 'ONLINE'`, `Order.status = 'AWAITING_PAYMENT'`, `lastReplyAt = NULL`. **Platforma nu e bolnavă; panoul de administrare e cel care ascunde boala.** Repararea acestui lucru — un health-check real, o stare reală, o alarmă reală — e cea mai bună investiție posibilă înainte de orice altă.

**O ultimă notă de metodă, pentru că afectează încrederea în cifre:** acest rezumat a fost atacat de un auditor independent (`12b-INDEPENDENT-AUDIT.md`), care a găsit **31 de erori în sinteză**, inclusiv patru critice — contoare greșite, condiții de inversare care lăsau deschise exact cele mai scumpe trei P0 de plată, o eroare aritmetică în prețul recomandat și un rând de porți greșit atribuit. **Toate cele 31 sunt corectate în versiunea de mai sus**, iar condițiile de inversare au crescut de la 13 la 19 tocmai pentru că auditorul a arătat că cele 13 nu erau suficiente.

---

## Anexă — ce nu am putut verifica

| Limitare | Ce e blocat | Deblocare |
|---|---|---|
| **VM 100** (panou) — fără shell, QEMU guest agent ne-rulat | 19 afirmații `unverifiable`; poarta 7 nu e evaluabilă complet; `DR-05` | Cheie de audit read-only în `authorized_keys` |
| **VM 101** (nod) — fără shell | Starea live a containerelor pe nod; capacitatea reală pe disc; backup posture-ul panoului | QEMU guest agent + cheie de audit |
| **Plăți live** — `STRIPE_SECRET_KEY` gol | Niciun test nu dovedește o plată reușită | Cont Stripe de **test**, în afara producției |
| **E-mail** — `SMTP_URL` gol | Nicio livrare dovedită; `delivered: false` | Relay Brevo/Resend |
| **Fonturile Proxima Nova** — cele 3 WOFF2 lipsesc | Interfața desenează cu Geist; 3 cereri 404 la fiecare încărcare | Fișierele licențiate în `web/public/fonts/` |
| **Copie off-host** — nu există țintă | Nimic nu e recuperabil azi | Decizia D-2 |
| **D-1** — prețul | `C_node` e o ancoră de piață, nu o factură | Valoarea reală a operatorului |
| **Conformitate** — 29 de elemente | Niciun răspuns juridic sau fiscal | Profesionist |

**Nicio cifră din acest rezumat nu e inventată.** Tot ce e marcat `VERIFIED` a fost măsurat; tot ce e `INFERRED` poartă explicit ipoteza; tot ce e `BLOCKED` spune exact de ce.
